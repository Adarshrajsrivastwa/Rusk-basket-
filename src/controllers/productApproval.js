const Product = require('../models/Product');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

exports.approveProduct = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    const { rejectionReason } = req.body;
    const action = req.originalUrl.includes('/approve') ? 'approve' : 'reject';

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    if (action === 'approve') {
      product.approvalStatus = 'approved';
      product.approvedBy = req.admin._id;
      product.approvedAt = new Date();
      product.rejectionReason = undefined;
    } else {
      product.approvalStatus = 'rejected';
      product.rejectionReason = rejectionReason || 'Product rejected by super admin';
      product.approvedBy = undefined;
      product.approvedAt = undefined;
    }

    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('approvedBy', 'name email');

    logger.info(`Product ${action}d: ${product.productName} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `Product ${action}d successfully`,
      data: populatedProduct,
    });
  } catch (error) {
    logger.error('Approve/Reject product error:', error);
    next(error);
  }
};


