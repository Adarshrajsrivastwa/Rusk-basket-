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
    // Validate credentials
    if (!credentials.razorpayKeyId || !credentials.razorpayKeySecret) {
      throw new Error('Razorpay Key ID and Key Secret are required. Please configure Razorpay credentials in admin panel.');
    }

    const Razorpay = require('razorpay');

    const razorpay = new Razorpay({
      key_id: credentials.razorpayKeyId.trim(),
      key_secret: credentials.razorpayKeySecret.trim(),
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
      // Frontend ke liye structured data
      frontendData: {
        gateway: 'razorpay',
        keyId: credentials.razorpayKeyId,
        orderId: order.id,
        amount: order.amount, // Amount in paise for Razorpay
        currency: order.currency,
        name: orderData.items?.[0]?.title || 'Order Payment',
        description: `Payment for Order ${orderData.orderNumber}`,
        prefill: {
          name: orderData.shippingAddress?.name || '',
          email: orderData.email || '',
          contact: orderData.phone || '',
        },
        notes: {
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
          userId: orderData.userId,
        },
        theme: {
          color: '#3399cc',
        },
      },
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
 * Create Razorpay Payment Link
 */
const createRazorpayPaymentLink = async (paymentData, credentials) => {
  try {
    // Validate credentials
    if (!credentials.razorpayKeyId || !credentials.razorpayKeySecret) {
      throw new Error('Razorpay Key ID and Key Secret are required. Please configure Razorpay credentials in admin panel.');
    }

    const Razorpay = require('razorpay');

    const razorpay = new Razorpay({
      key_id: credentials.razorpayKeyId.trim(),
      key_secret: credentials.razorpayKeySecret.trim(),
    });

    const referenceId = paymentData.referenceId || `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const paymentLinkOptions = {
      amount: Math.round(paymentData.amount * 100), // Amount in paise
      currency: paymentData.currency || 'INR',
      description: paymentData.description || 'Payment',
      reference_id: referenceId,
      customer: {
        name: paymentData.name || '',
        email: paymentData.email || '',
        contact: paymentData.contact || '',
      },
      notify: {
        sms: paymentData.notify?.sms !== false, // Default true
        email: paymentData.notify?.email !== false, // Default true
      },
      callback_url: paymentData.callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`,
      callback_method: paymentData.callbackMethod || 'get',
      notes: paymentData.notes || {},
    };

    const paymentLink = await razorpay.paymentLink.create(paymentLinkOptions);

    return {
      success: true,
      paymentGateway: 'razorpay',
      payment_url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
      referenceId: referenceId,
      amount: paymentLink.amount / 100,
      currency: paymentLink.currency,
      status: paymentLink.status,
    };
  } catch (error) {
    logger.error('Razorpay payment link creation error:', error);
    throw new Error(`Razorpay payment link creation failed: ${error.message}`);
  }
};

/**
 * Verify Razorpay payment
 * Supports both Orders API and Payment Link flows
 */
const verifyRazorpayPayment = async (paymentData, credentials) => {
  try {
    const crypto = require('crypto');
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature
    } = paymentData;

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_signature) {
      throw new Error('razorpay_payment_id and razorpay_signature are required');
    }

    // Trim all values to remove any extra spaces/newlines
    const paymentId = razorpay_payment_id ? razorpay_payment_id.toString().trim() : '';
    const signature = razorpay_signature ? razorpay_signature.toString().trim() : '';
    const paymentLinkId = razorpay_payment_link_id ? razorpay_payment_link_id.toString().trim() : '';
    const referenceId = razorpay_payment_link_reference_id ? razorpay_payment_link_reference_id.toString().trim() : '';
    const linkStatus = razorpay_payment_link_status ? razorpay_payment_link_status.toString().trim() : '';
    const orderId = razorpay_order_id ? razorpay_order_id.toString().trim() : '';
    const secretKey = credentials.razorpayKeySecret ? credentials.razorpayKeySecret.toString().trim() : '';

    if (!secretKey) {
      throw new Error('Razorpay Secret Key is missing. Please configure Razorpay credentials in admin panel.');
    }

    // Flow identification and fallback attempts
    let attempts = [];

    // Attempt 1: Based on provided IDs (Priority to Payment Link if present)
    if (paymentLinkId) {
      if (referenceId && linkStatus) {
        // Razorpay Payment Links full signature: plink_id|reference_id|status|payment_id
        attempts.push({
          name: 'Payment Link Flow (full)',
          text: `${paymentLinkId}|${referenceId}|${linkStatus}|${paymentId}`,
          id: paymentLinkId
        });
      }
      // Fallback: simple payment link format (plink_id|payment_id)
      attempts.push({
        name: 'Payment Link Flow (simple)',
        text: `${paymentLinkId}|${paymentId}`,
        id: paymentLinkId
      });
    }

    // Attempt: If order_id is present, try Orders API format
    if (orderId) {
      attempts.push({
        name: 'Orders API Flow',
        text: `${orderId}|${paymentId}`,
        id: orderId
      });
    }

    if (attempts.length === 0) {
      throw new Error('Either razorpay_order_id (Orders API) or razorpay_payment_link_id (Payment Link) is required');
    }

    let lastError = null;
    for (const attempt of attempts) {
      const generatedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(attempt.text)
        .digest('hex');

      if (generatedSignature === signature) {
        logger.info(`✅ Razorpay signature verified successfully using ${attempt.name}`, {
          identifier: attempt.id,
          paymentId: paymentId
        });

        return {
          success: true,
          paymentId: paymentId,
          orderId: orderId || undefined,
          paymentLinkId: paymentLinkId || undefined,
          gateway: 'razorpay',
          verificationMethod: attempt.name
        };
      }

      logger.warn(`❌ Razorpay signature mismatch for ${attempt.name}`, {
        text: attempt.text,
        generated: generatedSignature.substring(0, 10) + '...',
        received: signature.substring(0, 10) + '...'
      });

      lastError = `Invalid payment signature for ${attempt.name}.`;
    }

    // Both attempts failed
    logger.error('Razorpay verification failed after all identifier attempts', {
      triedFlows: attempts.map(a => a.name),
      secretKeyLength: secretKey.length,
      secretKeyPrefix: secretKey.substring(0, 10) + '...'
    });

    const helpMsg = paymentLinkId
      ? 'Verify: 1) Razorpay Secret Key is correct, 2) Link created with same credentials (test/prod), 3) Use plink_id|payment_id for links.'
      : 'Verify: 1) Razorpay Secret Key is correct, 2) Order created with same credentials, 3) Use order_id|payment_id for orders.';

    throw new Error(`${lastError} ${helpMsg}`);
  } catch (error) {
    logger.error('Razorpay payment verification implementation error:', error);
    throw error;
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
        // Frontend ke liye structured data
        frontendData: {
          gateway: 'phonepay',
          redirectUrl: response.data.data.instrumentResponse.redirectInfo.url,
          merchantTransactionId: merchantTransactionId,
          amount: amount / 100,
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
        },
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

    // Convert items to Shopify line_items format
    // Shopify expects: [{ variant_id, quantity, price }] or [{ product_id, quantity, price }]
    const lineItems = (orderData.items || []).map(item => ({
      quantity: item.quantity || 1,
      price: item.price || item.salePrice || item.unitPrice || 0,
      title: item.title || item.productName || 'Product',
      // If variant_id or product_id available, include them
      ...(item.variantId && { variant_id: item.variantId }),
      ...(item.productId && !item.variantId && { product_id: item.productId }),
    }));

    // Format shipping address for Shopify
    const formatShopifyAddress = (address) => {
      if (!address) return {};
      return {
        first_name: address.name?.split(' ')[0] || '',
        last_name: address.name?.split(' ').slice(1).join(' ') || '',
        address1: address.line1 || '',
        address2: address.line2 || '',
        city: address.city || '',
        province: address.state || '',
        zip: address.pinCode || '',
        country: address.country || 'India',
        phone: address.phone || '',
      };
    };

    // Create checkout session
    const checkoutData = {
      checkout: {
        line_items: lineItems,
        email: orderData.email || '',
        shipping_address: formatShopifyAddress(orderData.shippingAddress),
        billing_address: formatShopifyAddress(orderData.billingAddress || orderData.shippingAddress),
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
        // Frontend ke liye structured data
        frontendData: {
          gateway: 'shopify',
          checkoutUrl: response.data.checkout.abandoned_checkout_url,
          checkoutId: response.data.checkout.id,
          amount: orderData.amount,
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
        },
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
 * Initialize payment with Cashfree
 */
const initializeCashfreePayment = async (orderData, credentials, testMode = false) => {
  try {
    // Validate credentials
    if (!credentials.cashfreeAppId || !credentials.cashfreeSecretKey) {
      throw new Error('Cashfree App ID and Secret Key are required. Please configure Cashfree credentials in admin panel.');
    }

    const baseUrl = testMode
      ? 'https://sandbox.cashfree.com/pg'
      : 'https://api.cashfree.com/pg';

    const apiVersion = credentials.cashfreeApiVersion || '2022-09-01';
    const orderId = `ORDER_${orderData.orderId || orderData.orderNumber}_${Date.now()}`;
    const amount = Math.round(orderData.amount * 100); // Amount in paise

    const payload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      order_note: `Payment for Order ${orderData.orderNumber || orderData.orderId}`,
      customer_details: {
        customer_id: orderData.userId || 'USER',
        customer_name: orderData.shippingAddress?.name || '',
        customer_email: orderData.email || '',
        customer_phone: orderData.phone || orderData.shippingAddress?.phone || '',
      },
      order_meta: {
        return_url: orderData.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback?order_id={order_id}`,
        notify_url: `${process.env.API_URL || 'http://localhost:3000'}/api/payment/cashfree/callback`,
      },
    };

    const response = await axios.post(
      `${baseUrl}/orders`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': apiVersion,
          'x-client-id': credentials.cashfreeAppId.trim(),
          'x-client-secret': credentials.cashfreeSecretKey.trim(),
        },
      }
    );

    if (response.data && response.data.payment_session_id) {
      // Use payment_link directly from Cashfree API response
      const paymentLink = response.data.payment_link;

      if (!paymentLink) {
        logger.warn('Cashfree response missing payment_link field, using payment_session_id only');
      }

      return {
        success: true,
        paymentGateway: 'cashfree',
        orderId: response.data.order_id,
        paymentSessionId: response.data.payment_session_id,
        paymentLink: paymentLink, // Include payment_link from API
        amount: amount / 100,
        // Frontend ke liye structured data
        frontendData: {
          gateway: 'cashfree',
          paymentSessionId: response.data.payment_session_id,
          paymentLink: paymentLink, // Include payment_link for frontend
          orderId: response.data.order_id,
          amount: amount / 100,
          orderNumber: orderData.orderNumber,
        },
        paymentData: {
          orderId: response.data.order_id,
          paymentSessionId: response.data.payment_session_id,
          amount: amount,
        },
      };
    } else {
      throw new Error('Cashfree payment initialization failed');
    }
  } catch (error) {
    logger.error('Cashfree payment initialization error:', error);
    throw new Error(`Cashfree payment failed: ${error.message}`);
  }
};

/**
 * Verify Cashfree payment
 */
const verifyCashfreePayment = async (paymentData, credentials, testMode = false) => {
  try {
    const baseUrl = testMode
      ? 'https://sandbox.cashfree.com/pg'
      : 'https://api.cashfree.com/pg';

    const apiVersion = credentials.cashfreeApiVersion || '2022-09-01';
    const { orderId, paymentSessionId } = paymentData;

    if (!orderId) {
      throw new Error('Order ID is required for Cashfree payment verification');
    }

    // Get order status from Cashfree
    const response = await axios.get(
      `${baseUrl}/orders/${orderId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': apiVersion,
          'x-client-id': credentials.cashfreeAppId.trim(),
          'x-client-secret': credentials.cashfreeSecretKey.trim(),
        },
      }
    );

    if (response.data && response.data.order_status === 'PAID') {
      // Get payment details
      const paymentResponse = await axios.get(
        `${baseUrl}/orders/${orderId}/payments`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': apiVersion,
            'x-client-id': credentials.cashfreeAppId.trim(),
            'x-client-secret': credentials.cashfreeSecretKey.trim(),
          },
        }
      );

      const payments = paymentResponse.data || [];
      const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS');

      if (successfulPayment) {
        return {
          success: true,
          paymentId: successfulPayment.cf_payment_id || successfulPayment.payment_id,
          orderId: orderId,
          gateway: 'cashfree',
        };
      } else {
        throw new Error('Payment verification failed - no successful payment found');
      }
    } else {
      throw new Error('Payment verification failed or payment was not successful');
    }
  } catch (error) {
    logger.error('Cashfree payment verification error:', error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Initialize payment based on active gateway
 */
const initializePayment = async (orderData) => {
  try {
    const gateway = await getActivePaymentGateway();

    // Merge credentials - test credentials override production credentials if testMode is enabled
    let credentials = { ...gateway.credentials };
    if (gateway.testMode && gateway.testCredentials) {
      // Only merge non-empty test credentials
      Object.keys(gateway.testCredentials).forEach(key => {
        if (gateway.testCredentials[key] && gateway.testCredentials[key].trim()) {
          credentials[key] = gateway.testCredentials[key];
        }
      });
    }

    // Log credentials status for debugging (without exposing secrets)
    logger.info(`Initializing payment with gateway: ${gateway.name}, testMode: ${gateway.testMode}`);
    logger.info(`Credentials check - KeyId present: ${!!credentials.razorpayKeyId}, KeySecret present: ${!!credentials.razorpayKeySecret}`);

    switch (gateway.name) {
      case 'razorpay':
        return await initializeRazorpayPayment(orderData, credentials);

      case 'phonepay':
        return await initializePhonePePayment(orderData, credentials, gateway.testMode);

      case 'shopify':
        return await initializeShopifyPayment(orderData, credentials);

      case 'cashfree':
        return await initializeCashfreePayment(orderData, credentials, gateway.testMode);

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

    // For Razorpay, try both test and production credentials if first attempt fails
    // This handles cases where payment link was created with different mode
    if (gatewayName === 'razorpay') {
      // First attempt: Use current testMode setting
      let credentials = { ...gateway.credentials };
      if (gateway.testMode && gateway.testCredentials) {
        Object.keys(gateway.testCredentials).forEach(key => {
          if (gateway.testCredentials[key] && gateway.testCredentials[key].toString().trim()) {
            credentials[key] = gateway.testCredentials[key];
          }
        });
      }

      logger.info(`Verifying Razorpay payment (attempt 1) - testMode: ${gateway.testMode}`, {
        hasKeyId: !!credentials.razorpayKeyId,
        hasKeySecret: !!credentials.razorpayKeySecret,
        keyIdPrefix: credentials.razorpayKeyId ? credentials.razorpayKeyId.substring(0, 10) + '...' : 'N/A',
      });

      try {
        return await verifyRazorpayPayment(paymentData, credentials);
      } catch (firstError) {
        // If signature verification failed, try with alternate credentials
        if (firstError.message.includes('Invalid payment signature') || firstError.message.includes('signature')) {
          logger.warn('First verification attempt failed, trying alternate credentials', {
            firstAttemptMode: gateway.testMode ? 'test' : 'production',
          });

          // Second attempt: Try opposite mode
          let alternateCredentials = { ...gateway.credentials };
          if (!gateway.testMode && gateway.testCredentials) {
            // Current mode is production, try test credentials
            Object.keys(gateway.testCredentials).forEach(key => {
              if (gateway.testCredentials[key] && gateway.testCredentials[key].toString().trim()) {
                alternateCredentials[key] = gateway.testCredentials[key];
              }
            });
            logger.info('Trying test credentials as fallback');
          } else if (gateway.testMode) {
            // Current mode is test, try production credentials only
            // (don't merge test credentials)
            logger.info('Trying production credentials as fallback');
          }

          try {
            return await verifyRazorpayPayment(paymentData, alternateCredentials);
          } catch (secondError) {
            // Both attempts failed, throw original error with more context
            logger.error('Both verification attempts failed', {
              firstError: firstError.message,
              secondError: secondError.message,
            });
            throw new Error(`Payment verification failed: Invalid payment signature. Please ensure the payment link was created with the same credentials (test/production) that are currently configured.`);
          }
        } else {
          // Other errors, throw as is
          throw firstError;
        }
      }
    }

    // For other gateways, use standard logic
    // Merge credentials - test credentials override production credentials if testMode is enabled
    let credentials = { ...gateway.credentials };
    if (gateway.testMode && gateway.testCredentials) {
      Object.keys(gateway.testCredentials).forEach(key => {
        if (gateway.testCredentials[key] && gateway.testCredentials[key].toString().trim()) {
          credentials[key] = gateway.testCredentials[key];
        }
      });
    }

    logger.info(`Verifying payment with gateway: ${gateway.name}, testMode: ${gateway.testMode}`);

    switch (gatewayName) {
      case 'phonepay':
        return await verifyPhonePePayment(paymentData, credentials, gateway.testMode);

      case 'shopify':
        return await verifyShopifyPayment(paymentData, credentials);

      case 'cashfree':
        return await verifyCashfreePayment(paymentData, credentials, gateway.testMode);

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
 * Test Cashfree credentials
 */
const testCashfreeCredentials = async (credentials, isTestMode = false) => {
  try {
    if (!credentials.cashfreeAppId || !credentials.cashfreeSecretKey) {
      throw new Error('App ID and Secret Key are required');
    }

    // Validate that credentials are not empty after trimming
    const appId = credentials.cashfreeAppId?.trim();
    const secretKey = credentials.cashfreeSecretKey?.trim();

    if (!appId || !secretKey) {
      throw new Error('App ID and Secret Key cannot be empty');
    }

    const baseUrl = isTestMode
      ? 'https://sandbox.cashfree.com/pg'
      : 'https://api.cashfree.com/pg';

    const apiVersion = credentials.cashfreeApiVersion || '2022-09-01';

    // Test API connection by trying to get order status (will fail but validates credentials)
    // Or we can make a simple API call to validate credentials
    try {
      // Try to get a non-existent order to test credentials
      // This will return 404 if credentials are valid, or 401/403 if invalid
      const response = await axios.get(
        `${baseUrl}/orders/TEST_ORDER_${Date.now()}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': apiVersion,
            'x-client-id': appId,
            'x-client-secret': secretKey,
          },
          timeout: 15000,
          validateStatus: function (status) {
            // Accept all status codes to handle them manually
            return status >= 200 && status < 600;
          },
        }
      );

      // If we get a 200 response (unlikely for non-existent order), credentials are valid
      if (response.status === 200) {
        return {
          success: true,
          message: 'Cashfree credentials are valid',
          gateway: 'cashfree',
        };
      }
    } catch (apiError) {
      // Handle axios errors
      if (apiError.response) {
        const status = apiError.response.status;

        // 401 or 403 means invalid credentials
        if (status === 401 || status === 403) {
          const errorMessage = apiError.response.data?.message ||
            apiError.response.data?.error ||
            'Invalid Cashfree credentials. Please check your App ID and Secret Key.';
          throw new Error(errorMessage);
        }

        // 404 means credentials are valid but order doesn't exist (expected)
        if (status === 404) {
          return {
            success: true,
            message: 'Cashfree credentials are valid',
            gateway: 'cashfree',
          };
        }

        // Other 4xx/5xx errors
        const errorMessage = apiError.response.data?.message ||
          apiError.response.data?.error ||
          `Cashfree API error (${status}). Please check your credentials and try again.`;
        throw new Error(errorMessage);
      }

      // Network errors, timeouts, etc.
      if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
        throw new Error('Connection timeout. Please check your internet connection and try again.');
      }

      if (apiError.code === 'ENOTFOUND' || apiError.code === 'ECONNREFUSED') {
        throw new Error('Unable to connect to Cashfree API. Please check your network connection.');
      }

      // Re-throw if it's already our custom error
      if (apiError.message.includes('Invalid Cashfree credentials') ||
        apiError.message.includes('App ID and Secret Key')) {
        throw apiError;
      }

      // Unknown error
      throw new Error(`Cashfree API connection failed: ${apiError.message}`);
    }

    // If we reach here, credentials are valid (404 case handled in catch)
    return {
      success: true,
      message: 'Cashfree credentials are valid',
      gateway: 'cashfree',
    };
  } catch (error) {
    logger.error('Cashfree credentials test error:', error);

    // If it's already a formatted error message, throw it as is
    if (error.message.includes('Invalid Cashfree') ||
      error.message.includes('App ID and Secret Key') ||
      error.message.includes('Cashfree API') ||
      error.message.includes('Connection timeout') ||
      error.message.includes('Unable to connect')) {
      throw error;
    }

    // Otherwise, wrap it
    throw new Error(`Cashfree credentials test failed: ${error.message}`);
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

      case 'cashfree':
        return await testCashfreeCredentials(credentials, isTestMode);

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
  createRazorpayPaymentLink,
  verifyRazorpayPayment,
  initializePhonePePayment,
  verifyPhonePePayment,
  initializeShopifyPayment,
  verifyShopifyPayment,
  initializeCashfreePayment,
  verifyCashfreePayment,
  testPaymentGatewayCredentials,
};
