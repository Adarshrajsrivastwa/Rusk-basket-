const PaymentGateway = require('../models/PaymentGateway');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { testPaymentGatewayCredentials } = require('../services/paymentService');

/**
 * Get all payment gateways
 */
exports.getAllPaymentGateways = async (req, res, next) => {
  try {
    const gateways = await PaymentGateway.find()
      .sort({ priority: -1, name: 1 })
      .select('-credentials.shopifyApiSecret -credentials.razorpayKeySecret -credentials.phonepaySaltKey -testCredentials')
      .lean();

    res.status(200).json({
      success: true,
      count: gateways.length,
      data: gateways,
    });
  } catch (error) {
    logger.error('Get all payment gateways error:', error);
    next(error);
  }
};

/**
 * Get single payment gateway by ID
 */
exports.getPaymentGateway = async (req, res, next) => {
  try {
    const { gatewayId } = req.params;

    const gateway = await PaymentGateway.findById(gatewayId)
      .select('-credentials.shopifyApiSecret -credentials.razorpayKeySecret -credentials.phonepaySaltKey -testCredentials.shopifyApiSecret -testCredentials.razorpayKeySecret -testCredentials.phonepaySaltKey')
      .lean();

    if (!gateway) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found',
      });
    }

    res.status(200).json({
      success: true,
      data: gateway,
    });
  } catch (error) {
    logger.error('Get payment gateway error:', error);
    next(error);
  }
};

/**
 * Create payment gateway
 */
exports.createPaymentGateway = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      name,
      displayName,
      isEnabled,
      credentials,
      testMode,
      testCredentials,
      priority,
      description,
    } = req.body;

    // Check if gateway with same name already exists
    const existingGateway = await PaymentGateway.findOne({ name });
    if (existingGateway) {
      return res.status(400).json({
        success: false,
        error: `Payment gateway with name '${name}' already exists`,
      });
    }

    const gateway = new PaymentGateway({
      name,
      displayName,
      isEnabled: isEnabled || false,
      credentials: credentials || {},
      testMode: testMode || false,
      testCredentials: testCredentials || {},
      priority: priority || 0,
      description: description || '',
    });

    await gateway.save();

    logger.info(`Payment gateway created: ${name} by Admin: ${req.admin._id}`);

    const gatewayResponse = gateway.toObject();
    delete gatewayResponse.credentials?.shopifyApiSecret;
    delete gatewayResponse.credentials?.razorpayKeySecret;
    delete gatewayResponse.credentials?.phonepaySaltKey;
    delete gatewayResponse.testCredentials?.shopifyApiSecret;
    delete gatewayResponse.testCredentials?.razorpayKeySecret;
    delete gatewayResponse.testCredentials?.phonepaySaltKey;

    res.status(201).json({
      success: true,
      message: 'Payment gateway created successfully',
      data: gatewayResponse,
    });
  } catch (error) {
    logger.error('Create payment gateway error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Payment gateway with this name already exists',
      });
    }
    next(error);
  }
};

/**
 * Update payment gateway
 */
exports.updatePaymentGateway = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { gatewayId } = req.params;
    const {
      displayName,
      isEnabled,
      credentials,
      testMode,
      testCredentials,
      priority,
      description,
    } = req.body;

    const gateway = await PaymentGateway.findById(gatewayId);

    if (!gateway) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found',
      });
    }

    // Update fields
    if (displayName !== undefined) gateway.displayName = displayName;
    if (isEnabled !== undefined) gateway.isEnabled = isEnabled;
    if (credentials !== undefined) {
      gateway.credentials = { ...gateway.credentials, ...credentials };
    }
    if (testMode !== undefined) gateway.testMode = testMode;
    if (testCredentials !== undefined) {
      gateway.testCredentials = { ...gateway.testCredentials, ...testCredentials };
    }
    if (priority !== undefined) gateway.priority = priority;
    if (description !== undefined) gateway.description = description;

    await gateway.save();

    logger.info(`Payment gateway updated: ${gateway.name} by Admin: ${req.admin._id}`);

    const gatewayResponse = gateway.toObject();
    delete gatewayResponse.credentials?.shopifyApiSecret;
    delete gatewayResponse.credentials?.razorpayKeySecret;
    delete gatewayResponse.credentials?.phonepaySaltKey;
    delete gatewayResponse.testCredentials?.shopifyApiSecret;
    delete gatewayResponse.testCredentials?.razorpayKeySecret;
    delete gatewayResponse.testCredentials?.phonepaySaltKey;

    res.status(200).json({
      success: true,
      message: 'Payment gateway updated successfully',
      data: gatewayResponse,
    });
  } catch (error) {
    logger.error('Update payment gateway error:', error);
    next(error);
  }
};

/**
 * Toggle payment gateway enable/disable
 */
exports.togglePaymentGateway = async (req, res, next) => {
  try {
    const { gatewayId } = req.params;

    const gateway = await PaymentGateway.findById(gatewayId);

    if (!gateway) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found',
      });
    }

    gateway.isEnabled = !gateway.isEnabled;
    await gateway.save();

    logger.info(`Payment gateway ${gateway.isEnabled ? 'enabled' : 'disabled'}: ${gateway.name} by Admin: ${req.admin._id}`);

    const gatewayResponse = gateway.toObject();
    delete gatewayResponse.credentials?.shopifyApiSecret;
    delete gatewayResponse.credentials?.razorpayKeySecret;
    delete gatewayResponse.credentials?.phonepaySaltKey;
    delete gatewayResponse.testCredentials?.shopifyApiSecret;
    delete gatewayResponse.testCredentials?.razorpayKeySecret;
    delete gatewayResponse.testCredentials?.phonepaySaltKey;

    res.status(200).json({
      success: true,
      message: `Payment gateway ${gateway.isEnabled ? 'enabled' : 'disabled'} successfully`,
      data: gatewayResponse,
    });
  } catch (error) {
    logger.error('Toggle payment gateway error:', error);
    next(error);
  }
};

/**
 * Delete payment gateway
 */
exports.deletePaymentGateway = async (req, res, next) => {
  try {
    const { gatewayId } = req.params;

    const gateway = await PaymentGateway.findById(gatewayId);

    if (!gateway) {
      return res.status(404).json({
        success: false,
        error: 'Payment gateway not found',
      });
    }

    await PaymentGateway.findByIdAndDelete(gatewayId);

    logger.info(`Payment gateway deleted: ${gateway.name} by Admin: ${req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Payment gateway deleted successfully',
    });
  } catch (error) {
    logger.error('Delete payment gateway error:', error);
    next(error);
  }
};

/**
 * Get enabled payment gateways (public endpoint for frontend)
 */
exports.getEnabledPaymentGateways = async (req, res, next) => {
  try {
    const { getAllEnabledGateways } = require('../services/paymentService');
    const gateways = await getAllEnabledGateways();

    res.status(200).json({
      success: true,
      count: gateways.length,
      data: gateways,
    });
  } catch (error) {
    logger.error('Get enabled payment gateways error:', error);
    next(error);
  }
};

/**
 * Test payment gateway credentials
 */
exports.testPaymentGatewayCredentials = async (req, res, next) => {
  try {
    const { gatewayName, credentials, isTestMode } = req.body;

    if (!gatewayName) {
      return res.status(400).json({
        success: false,
        error: 'Gateway name is required',
      });
    }

    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Credentials are required and must be an object',
      });
    }

    if (!['razorpay', 'phonepay', 'shopify', 'cashfree'].includes(gatewayName.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid gateway name. Must be one of: razorpay, phonepay, shopify, cashfree',
      });
    }

    const result = await testPaymentGatewayCredentials(gatewayName, credentials, isTestMode);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    logger.error('Test payment gateway credentials error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to test credentials',
    });
  }
};