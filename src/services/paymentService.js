const PaymentGateway = require('../models/PaymentGateway');
const logger = require('../utils/logger');
const crypto = require('crypto');
const axios = require('axios');

/**
 * Get active payment gateway based on priority
 */
const getActivePaymentGateway = async () => {
  try {
    const gateway = await PaymentGateway.findOne({ isEnabled: true })
      .sort({ priority: -1 })
      .lean();

    if (!gateway) {
      throw new Error('No payment gateway is enabled. Please enable a payment gateway from admin panel.');
    }

    return gateway;
  } catch (error) {
    logger.error('Error getting active payment gateway:', error);
    throw error;
  }
};

/**
 * Get all enabled payment gateways
 */
const getAllEnabledGateways = async () => {
  try {
    const gateways = await PaymentGateway.find({ isEnabled: true })
      .sort({ priority: -1 })
      .select('name displayName priority')
      .lean();

    return gateways;
  } catch (error) {
    logger.error('Error getting enabled gateways:', error);
    throw error;
  }
};

/**
 * Initialize payment with Razorpay
 */
const initializeRazorpayPayment = async (orderData, credentials) => {
  try {
    const Razorpay = require('razorpay');
    
    const razorpay = new Razorpay({
      key_id: credentials.razorpayKeyId,
      key_secret: credentials.razorpayKeySecret,
    });

    const options = {
      amount: Math.round(orderData.amount * 100), // Amount in paise
      currency: 'INR',
      receipt: orderData.orderId || orderData.orderNumber,
      notes: {
        orderId: orderData.orderId || orderData.orderNumber,
        userId: orderData.userId,
      },
    };

    const order = await razorpay.orders.create(options);

    return {
      success: true,
      paymentGateway: 'razorpay',
      orderId: order.id,
      amount: order.amount / 100,
      currency: order.currency,
      keyId: credentials.razorpayKeyId,
      paymentData: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
    };
  } catch (error) {
    logger.error('Razorpay payment initialization error:', error);
    throw new Error(`Razorpay payment failed: ${error.message}`);
  }
};

/**
 * Verify Razorpay payment
 */
const verifyRazorpayPayment = async (paymentData, credentials) => {
  try {
    const crypto = require('crypto');
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', credentials.razorpayKeySecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      throw new Error('Invalid payment signature');
    }

    return {
      success: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      gateway: 'razorpay',
    };
  } catch (error) {
    logger.error('Razorpay payment verification error:', error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Initialize payment with PhonePe
 */
const initializePhonePePayment = async (orderData, credentials, testMode = false) => {
  try {
    const baseUrl = testMode 
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
      : 'https://api.phonepe.com/apis/hermes';

    const merchantTransactionId = `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const amount = Math.round(orderData.amount * 100); // Amount in paise

    const payload = {
      merchantId: credentials.phonepayMerchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: orderData.userId || 'USER',
      amount: amount,
      redirectUrl: orderData.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${process.env.API_URL || 'http://localhost:3000'}/api/payment/phonepay/callback`,
      mobileNumber: orderData.phone || '',
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    // Create X-VERIFY header
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const stringToHash = `${base64Payload}/pg/v1/pay${credentials.phonepaySaltKey}`;
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const xVerify = `${sha256Hash}###${credentials.phonepaySaltIndex || '1'}`;

    const response = await axios.post(
      `${baseUrl}/pg/v1/pay`,
      {
        request: base64Payload,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'Accept': 'application/json',
        },
      }
    );

    if (response.data && response.data.success && response.data.data) {
      return {
        success: true,
        paymentGateway: 'phonepay',
        merchantTransactionId: merchantTransactionId,
        amount: amount / 100,
        redirectUrl: response.data.data.instrumentResponse.redirectInfo.url,
        paymentData: {
          merchantTransactionId: merchantTransactionId,
          amount: amount,
        },
      };
    } else {
      throw new Error('PhonePe payment initialization failed');
    }
  } catch (error) {
    logger.error('PhonePe payment initialization error:', error);
    throw new Error(`PhonePe payment failed: ${error.message}`);
  }
};

/**
 * Verify PhonePe payment
 */
const verifyPhonePePayment = async (paymentData, credentials, testMode = false) => {
  try {
    const baseUrl = testMode
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
      : 'https://api.phonepe.com/apis/hermes';

    const { merchantTransactionId } = paymentData;

    const stringToHash = `/pg/v1/status/${credentials.phonepayMerchantId}/${merchantTransactionId}${credentials.phonepaySaltKey}`;
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const xVerify = `${sha256Hash}###${credentials.phonepaySaltIndex || '1'}`;

    const response = await axios.get(
      `${baseUrl}/pg/v1/status/${credentials.phonepayMerchantId}/${merchantTransactionId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': credentials.phonepayMerchantId,
          'Accept': 'application/json',
        },
      }
    );

    if (response.data && response.data.success && response.data.code === 'PAYMENT_SUCCESS') {
      return {
        success: true,
        paymentId: response.data.data.transactionId,
        merchantTransactionId: merchantTransactionId,
        gateway: 'phonepay',
      };
    } else {
      throw new Error('Payment verification failed or payment was not successful');
    }
  } catch (error) {
    logger.error('PhonePe payment verification error:', error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Initialize payment with Shopify
 */
const initializeShopifyPayment = async (orderData, credentials) => {
  try {
    const storeUrl = credentials.shopifyStoreUrl.replace(/\/$/, '');
    const apiUrl = `${storeUrl}/admin/api/2024-01/checkouts.json`;

    // Create checkout session
    const checkoutData = {
      checkout: {
        line_items: orderData.items || [],
        email: orderData.email || '',
        shipping_address: orderData.shippingAddress || {},
        billing_address: orderData.billingAddress || orderData.shippingAddress || {},
        note: `Order: ${orderData.orderNumber || orderData.orderId}`,
      },
    };

    const response = await axios.post(apiUrl, checkoutData, {
      headers: {
        'X-Shopify-Access-Token': credentials.shopifyAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.checkout) {
      return {
        success: true,
        paymentGateway: 'shopify',
        checkoutId: response.data.checkout.id,
        checkoutUrl: response.data.checkout.abandoned_checkout_url,
        amount: orderData.amount,
        paymentData: {
          checkoutId: response.data.checkout.id,
        },
      };
    } else {
      throw new Error('Shopify payment initialization failed');
    }
  } catch (error) {
    logger.error('Shopify payment initialization error:', error);
    throw new Error(`Shopify payment failed: ${error.message}`);
  }
};

/**
 * Verify Shopify payment
 */
const verifyShopifyPayment = async (paymentData, credentials) => {
  try {
    const storeUrl = credentials.shopifyStoreUrl.replace(/\/$/, '');
    const { checkoutId, orderId } = paymentData;

    // Verify order in Shopify
    const apiUrl = `${storeUrl}/admin/api/2024-01/orders/${orderId || checkoutId}.json`;

    const response = await axios.get(apiUrl, {
      headers: {
        'X-Shopify-Access-Token': credentials.shopifyAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.order && response.data.order.financial_status === 'paid') {
      return {
        success: true,
        paymentId: response.data.order.id.toString(),
        orderId: response.data.order.order_number.toString(),
        gateway: 'shopify',
      };
    } else {
      throw new Error('Payment verification failed or payment was not successful');
    }
  } catch (error) {
    logger.error('Shopify payment verification error:', error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Initialize payment based on active gateway
 */
const initializePayment = async (orderData) => {
  try {
    const gateway = await getActivePaymentGateway();
    const credentials = gateway.testMode 
      ? { ...gateway.credentials, ...gateway.testCredentials } 
      : gateway.credentials;

    switch (gateway.name) {
      case 'razorpay':
        return await initializeRazorpayPayment(orderData, credentials);
      
      case 'phonepay':
        return await initializePhonePePayment(orderData, credentials, gateway.testMode);
      
      case 'shopify':
        return await initializeShopifyPayment(orderData, credentials);
      
      default:
        throw new Error(`Unsupported payment gateway: ${gateway.name}`);
    }
  } catch (error) {
    logger.error('Payment initialization error:', error);
    throw error;
  }
};

/**
 * Verify payment based on gateway
 */
const verifyPayment = async (paymentData, gatewayName) => {
  try {
    const gateway = await PaymentGateway.findOne({ name: gatewayName, isEnabled: true });
    
    if (!gateway) {
      throw new Error(`Payment gateway ${gatewayName} is not enabled`);
    }

    const credentials = gateway.testMode 
      ? { ...gateway.credentials, ...gateway.testCredentials } 
      : gateway.credentials;

    switch (gatewayName) {
      case 'razorpay':
        return await verifyRazorpayPayment(paymentData, credentials);
      
      case 'phonepay':
        return await verifyPhonePePayment(paymentData, credentials, gateway.testMode);
      
      case 'shopify':
        return await verifyShopifyPayment(paymentData, credentials);
      
      default:
        throw new Error(`Unsupported payment gateway: ${gatewayName}`);
    }
  } catch (error) {
    logger.error('Payment verification error:', error);
    throw error;
  }
};

/**
 * Test Razorpay credentials
 */
const testRazorpayCredentials = async (credentials) => {
  try {
    const Razorpay = require('razorpay');
    
    if (!credentials.razorpayKeyId || !credentials.razorpayKeySecret) {
      throw new Error('Key ID and Key Secret are required');
    }
    
    const razorpay = new Razorpay({
      key_id: credentials.razorpayKeyId,
      key_secret: credentials.razorpayKeySecret,
    });

    // Try to fetch account details to verify credentials
    // Using a simple API call that doesn't require existing data
    try {
      await razorpay.payments.all({ count: 1 });
    } catch (apiError) {
      // If it's a 404 or empty result, credentials are still valid
      // Only fail if it's an authentication error
      if (apiError.statusCode === 401 || apiError.statusCode === 403) {
        throw new Error('Invalid Razorpay credentials. Please check your Key ID and Key Secret.');
      }
      // For other errors (like 404), credentials are likely valid
    }
    
    return {
      success: true,
      message: 'Razorpay credentials are valid',
      gateway: 'razorpay',
    };
  } catch (error) {
    logger.error('Razorpay credentials test error:', error);
    throw new Error(`Razorpay credentials test failed: ${error.message}`);
  }
};

/**
 * Test PhonePe credentials
 */
const testPhonePeCredentials = async (credentials) => {
  try {
    if (!credentials.phonepayMerchantId || !credentials.phonepaySaltKey) {
      throw new Error('Merchant ID and Salt Key are required');
    }

    // PhonePe doesn't have a direct test API, so we validate the structure
    // In production, you might want to make a test API call
    if (!credentials.phonepayMerchantId.trim()) {
      throw new Error('Merchant ID cannot be empty');
    }
    
    if (!credentials.phonepaySaltKey.trim()) {
      throw new Error('Salt Key cannot be empty');
    }

    return {
      success: true,
      message: 'PhonePe credentials structure is valid',
      gateway: 'phonepay',
      note: 'Note: This validates credential structure. Actual API connectivity should be tested with a real transaction.',
    };
  } catch (error) {
    logger.error('PhonePe credentials test error:', error);
    throw new Error(`PhonePe credentials test failed: ${error.message}`);
  }
};

/**
 * Test Shopify credentials
 */
const testShopifyCredentials = async (credentials) => {
  try {
    if (!credentials.shopifyStoreUrl || !credentials.shopifyApiKey || !credentials.shopifyAccessToken) {
      throw new Error('Store URL, API Key, and Access Token are required');
    }

    // Remove trailing slash from store URL if present
    const storeUrl = credentials.shopifyStoreUrl.replace(/\/$/, '');
    const apiUrl = `${storeUrl}/admin/api/2024-01/shop.json`;

    // Test API connection
    const response = await axios.get(apiUrl, {
      headers: {
        'X-Shopify-Access-Token': credentials.shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (response.data && response.data.shop) {
      return {
        success: true,
        message: 'Shopify credentials are valid',
        gateway: 'shopify',
        shopName: response.data.shop.name,
      };
    } else {
      throw new Error('Invalid response from Shopify API');
    }
  } catch (error) {
    logger.error('Shopify credentials test error:', error);
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('Invalid Shopify Access Token');
      } else if (error.response.status === 404) {
        throw new Error('Invalid Shopify Store URL');
      }
    }
    throw new Error(`Shopify credentials test failed: ${error.message}`);
  }
};

/**
 * Test payment gateway credentials
 */
const testPaymentGatewayCredentials = async (gatewayName, credentials, isTestMode = false) => {
  try {
    if (!gatewayName || !credentials) {
      throw new Error('Gateway name and credentials are required');
    }

    switch (gatewayName.toLowerCase()) {
      case 'razorpay':
        return await testRazorpayCredentials(credentials);
      
      case 'phonepay':
        return await testPhonePeCredentials(credentials);
      
      case 'shopify':
        return await testShopifyCredentials(credentials);
      
      default:
        throw new Error(`Unsupported payment gateway: ${gatewayName}`);
    }
  } catch (error) {
    logger.error('Payment gateway credentials test error:', error);
    throw error;
  }
};

module.exports = {
  getActivePaymentGateway,
  getAllEnabledGateways,
  initializePayment,
  verifyPayment,
  initializeRazorpayPayment,
  verifyRazorpayPayment,
  initializePhonePePayment,
  verifyPhonePePayment,
  initializeShopifyPayment,
  verifyShopifyPayment,
  testPaymentGatewayCredentials,
};
