const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const logger = require('../utils/logger');

/**
 * Validate if product is available for purchase
 * Returns { available: boolean, reason: string }
 */
const validateProductAvailability = (product) => {
  if (!product) {
    return { available: false, reason: 'Product not found' };
  }

  if (!product.vendor) {
    return { available: false, reason: 'Product vendor not found' };
  }

  if (!product.vendor.isActive) {
    return { available: false, reason: 'Product vendor is inactive' };
  }

  if (!product.isActive) {
    return { available: false, reason: 'Product is inactive' };
  }

  // Normalize approval status (trim and lowercase for comparison)
  const approvalStatus = product.approvalStatus ? String(product.approvalStatus).trim().toLowerCase() : null;

  if (!approvalStatus) {
    return { available: false, reason: 'Product approval status is missing' };
  }

  if (approvalStatus !== 'approved') {
    const statusMessages = {
      'pending': 'Product is pending approval',
      'rejected': 'Product has been rejected',
    };
    const normalizedStatus = approvalStatus;
    return {
      available: false,
      reason: statusMessages[normalizedStatus] || `Product approval status is "${product.approvalStatus}"`,
    };
  }

  return { available: true, reason: null };
};

/**
 * Get or create cart for user
 */
exports.getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  });

  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }

  return cart;
};

/**
 * Add item to cart
 */
exports.addToCart = async (userId, productId, quantity, sku = null) => {
  const product = await Product.findById(productId)
    .populate('vendor', 'storeName storeId isActive');

  // Validate product availability
  const validation = validateProductAvailability(product);
  if (!validation.available) {
    logger.warn(`Product ${productId} not available: ${validation.reason}`, {
      productId,
      approvalStatus: product?.approvalStatus,
      isActive: product?.isActive,
      vendorActive: product?.vendor?.isActive,
    });
    throw new Error(`${validation.reason}. This product is not available for purchase`);
  }

  // Check inventory
  let availableInventory = product.inventory;
  if (product.skus && product.skus.length > 0) {
    if (sku) {
      const skuItem = product.skus.find(s => s.sku === sku);
      if (!skuItem) {
        throw new Error('Invalid SKU');
      }
      availableInventory = skuItem.inventory;
    } else {
      throw new Error('SKU is required for this product');
    }
  }

  if (availableInventory < quantity) {
    throw new Error(`Only ${availableInventory} items available in stock`);
  }

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }

  // Check if item already exists in cart
  const existingItemIndex = cart.items.findIndex(
    item => item.product.toString() === productId.toString() && item.sku === sku
  );

  if (existingItemIndex > -1) {
    const newQuantity = cart.items[existingItemIndex].quantity + quantity;
    if (newQuantity > availableInventory) {
      throw new Error(`Only ${availableInventory} items available in stock`);
    }
    cart.items[existingItemIndex].quantity = newQuantity;
  } else {
    cart.items.push({
      product: productId,
      quantity,
      sku,
    });
  }

  await cart.save();
  return await Cart.findById(cart._id).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  });
};

/**
 * Update cart item quantity
 */
exports.updateCartItem = async (userId, itemId, quantity) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found');
  }

  const item = cart.items.id(itemId);
  if (!item) {
    throw new Error('Item not found in cart');
  }

  // Log item details for debugging
  logger.info(`Updating cart item ${itemId}`, {
    itemId,
    productId: item.product,
    currentQuantity: item.quantity,
    newQuantity: quantity,
    sku: item.sku,
  });

  if (quantity <= 0) {
    cart.items.pull(itemId);
  } else {
    // Check if product ID exists
    if (!item.product) {
      logger.error(`Cart item ${itemId} has no product reference`);
      cart.items.pull(itemId);
      await cart.save();
      throw new Error('Product reference is missing from cart item. Item has been removed from cart');
    }

    // Convert product ID to string if it's an ObjectId
    const productId = item.product.toString ? item.product.toString() : item.product;
    
    const product = await Product.findById(productId)
      .populate('vendor', 'storeName storeId isActive');
    
    if (!product) {
      logger.error(`Product ${productId} not found for cart item ${itemId}`);
      cart.items.pull(itemId);
      await cart.save();
      throw new Error('Product not found. Item has been removed from cart');
    }
    
    // Validate product availability
    const validation = validateProductAvailability(product);
    if (!validation.available) {
      logger.warn(`Product ${productId} not available: ${validation.reason}`, {
        productId: item.product,
        itemId: itemId,
        approvalStatus: product?.approvalStatus,
        isActive: product?.isActive,
        vendorActive: product?.vendor?.isActive,
      });
      
      // Remove unavailable item from cart
      cart.items.pull(itemId);
      await cart.save();
      
      throw new Error(`${validation.reason}. Item has been removed from cart`);
    }

    // Check inventory
    let availableInventory = product.inventory;
    if (product.skus && product.skus.length > 0) {
      if (item.sku) {
        const skuItem = product.skus.find(s => s.sku === item.sku);
        if (!skuItem) {
          logger.warn(`Invalid SKU ${item.sku} for product ${item.product} in cart item ${itemId}`);
          cart.items.pull(itemId);
          await cart.save();
          throw new Error(`Invalid SKU for this product. Item has been removed from cart`);
        }
        availableInventory = skuItem.inventory;
      } else {
        logger.warn(`SKU required for product ${item.product} but not provided in cart item ${itemId}`);
        cart.items.pull(itemId);
        await cart.save();
        throw new Error('SKU is required for this product. Item has been removed from cart');
      }
    }

    if (quantity > availableInventory) {
      throw new Error(`Only ${availableInventory} items available in stock. Please reduce quantity`);
    }

    item.quantity = quantity;
  }

  await cart.save();
  return await Cart.findById(cart._id).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  });
};

/**
 * Remove item from cart
 */
exports.removeFromCart = async (userId, itemId) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found');
  }

  cart.items.pull(itemId);
  await cart.save();

  return await Cart.findById(cart._id).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  });
};

/**
 * Clear cart
 */
exports.clearCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found');
  }

  cart.items = [];
  cart.coupon = undefined;
  await cart.save();

  return cart;
};

/**
 * Apply coupon to cart
 */
exports.applyCoupon = async (userId, couponCode) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found');
  }

  if (cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

  if (!coupon) {
    throw new Error('Invalid coupon code');
  }

  if (!coupon.isValid()) {
    throw new Error('Coupon is not valid or expired');
  }

  // Calculate subtotal to validate coupon
  const totals = await cart.calculateTotals();
  const subtotal = totals.pricing.subtotal;

  // Validate coupon for order amount
  const discountResult = coupon.calculateDiscount(subtotal);

  if (!discountResult.valid) {
    throw new Error(discountResult.message || 'Coupon cannot be applied');
  }

  // Check if coupon is applicable to cart items
  if (coupon.appliedOn === 'select' && coupon.categories && coupon.categories.length > 0) {
    const Product = require('../models/Product');
    const cartProducts = await Product.find({
      _id: { $in: cart.items.map(item => item.product) },
    }).select('category');

    const cartCategories = cartProducts.map(p => p.category.toString());
    const applicableCategories = coupon.categories.map(c => c.toString());

    const hasApplicableCategory = cartCategories.some(cat => applicableCategories.includes(cat));

    if (!hasApplicableCategory) {
      throw new Error('Coupon is not applicable to items in your cart');
    }
  }

  cart.coupon = {
    couponId: coupon._id,
    code: coupon.code,
  };

  await cart.save();

  return await Cart.findById(cart._id).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  }).populate('coupon.couponId');
};

/**
 * Remove coupon from cart
 */
exports.removeCoupon = async (userId) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found');
  }

  cart.coupon = undefined;
  await cart.save();

  return await Cart.findById(cart._id).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  });
};

/**
 * Get cart with calculated totals
 */
exports.getCartWithTotals = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'productName thumbnail actualPrice regularPrice salePrice cashback inventory skus isActive approvalStatus vendor',
    populate: {
      path: 'vendor',
      select: 'storeName storeId isActive',
    },
  }).populate('coupon.couponId');

  if (!cart) {
    return {
      items: [],
      unavailableItems: [],
      pricing: {
        subtotal: 0,
        discount: 0,
        shipping: 0,
        tax: 0,
        total: 0,
        totalCashback: 0,
      },
    };
  }

  const totals = await cart.calculateTotals();

  // Remove unavailable items from cart if any
  if (totals.unavailableItems && totals.unavailableItems.length > 0) {
    const itemIdsToRemove = totals.unavailableItems.map(item => item.itemId);
    cart.items = cart.items.filter(item => !itemIdsToRemove.includes(item._id.toString()));
    await cart.save();
  }

  return {
    cart: cart,
    ...totals,
  };
};

/**
 * Create order from cart
 */
exports.createOrder = async (userId, shippingAddress, paymentMethod, notes = '') => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  // Calculate totals
  const totals = await cart.calculateTotals();

  if (totals.items.length === 0) {
    // Check if there are unavailable items
    if (totals.unavailableItems && totals.unavailableItems.length > 0) {
      const reasons = totals.unavailableItems.map(item => 
        `${item.productName || 'Product'}: ${item.reason}`
      ).join(', ');
      throw new Error(`Cannot create order. Some products are not available: ${reasons}`);
    }
    throw new Error('No valid items in cart. Please add products to your cart before checkout');
  }

  // If there are unavailable items, remove them from cart
  if (totals.unavailableItems && totals.unavailableItems.length > 0) {
    const itemIdsToRemove = totals.unavailableItems.map(item => item.itemId);
    cart.items = cart.items.filter(item => !itemIdsToRemove.includes(item._id.toString()));
    await cart.save();
  }

  // Validate and update inventory
  for (const item of totals.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product ${item.product} not found`);
    }

    if (product.skus && product.skus.length > 0 && item.sku) {
      const skuItem = product.skus.find(s => s.sku === item.sku);
      if (!skuItem || skuItem.inventory < item.quantity) {
        throw new Error(`Insufficient inventory for product ${product.productName}`);
      }
      skuItem.inventory -= item.quantity;
    } else {
      if (product.inventory < item.quantity) {
        throw new Error(`Insufficient inventory for product ${product.productName}`);
      }
      product.inventory -= item.quantity;
    }

    await product.save();
  }

  // Generate order number
  const orderNumber = await Order.generateOrderNumber();

  // Clean up items - ensure thumbnail is properly formatted (not null)
  const cleanedItems = totals.items.map(item => {
    const cleanedItem = { ...item };
    
    // Handle thumbnail - convert null to undefined or ensure it's a proper object
    if (cleanedItem.thumbnail === null || (cleanedItem.thumbnail && !cleanedItem.thumbnail.url)) {
      cleanedItem.thumbnail = undefined;
    } else if (cleanedItem.thumbnail && cleanedItem.thumbnail.url) {
      // Ensure thumbnail is a proper object
      cleanedItem.thumbnail = {
        url: cleanedItem.thumbnail.url || undefined,
        publicId: cleanedItem.thumbnail.publicId || undefined,
      };
    }
    
    return cleanedItem;
  });

  // Create order
  const order = await Order.create({
    orderNumber,
    user: userId,
    items: cleanedItems,
    pricing: totals.pricing,
    coupon: cart.coupon ? {
      couponId: cart.coupon.couponId,
      code: cart.coupon.code,
      discount: totals.pricing.discount,
    } : undefined,
    shippingAddress,
    payment: {
      method: paymentMethod,
      status: paymentMethod === 'cod' ? 'pending' : 'processing',
      amount: totals.pricing.total,
    },
    notes,
    status: 'pending',
  });

  // Update coupon usage count
  if (cart.coupon && cart.coupon.couponId) {
    const coupon = await Coupon.findById(cart.coupon.couponId);
    if (coupon) {
      coupon.usedCount = (coupon.usedCount || 0) + 1;
      await coupon.save();
    }
  }

  // Clear cart
  cart.items = [];
  cart.coupon = undefined;
  await cart.save();

  return await Order.findById(order._id)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber');
};

/**
 * Get user orders
 */
exports.getUserOrders = async (userId, page = 1, limit = 10, status = null) => {
  const skip = (page - 1) * limit;
  const query = { user: userId };

  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code')
    .populate('rider', 'fullName mobileNumber')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(query);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get order by ID
 */
exports.getOrderById = async (orderId, userId = null) => {
  const query = { _id: orderId };
  if (userId) {
    query.user = userId;
  }

  const order = await Order.findOne(query)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail description')
    .populate('items.vendor', 'storeName storeId storeAddress')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber');

  return order;
};

/**
 * Get vendor orders
 */
exports.getVendorOrders = async (vendorId, page = 1, limit = 10, status = null) => {
  const skip = (page - 1) * limit;
  const query = { 'items.vendor': vendorId };

  if (status) {
    query.status = status;
  }

  const orders = await Order.find(query)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail description')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code')
    .populate('rider', 'fullName mobileNumber')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(query);

  // Filter items to only show items from this vendor
  const ordersWithVendorItems = orders.map(order => {
    const orderObj = order.toObject();
    orderObj.items = orderObj.items.filter(item => 
      item.vendor && item.vendor._id.toString() === vendorId.toString()
    );
    
    // Recalculate pricing for vendor's items only
    const vendorItemsSubtotal = orderObj.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const vendorItemsCashback = orderObj.items.reduce((sum, item) => sum + (item.cashback || 0), 0);
    
    orderObj.vendorPricing = {
      itemsSubtotal: parseFloat(vendorItemsSubtotal.toFixed(2)),
      itemsCashback: parseFloat(vendorItemsCashback.toFixed(2)),
      itemCount: orderObj.items.length,
    };

    return orderObj;
  });

  return {
    orders: ordersWithVendorItems,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get vendor order by ID
 */
exports.getVendorOrderById = async (orderId, vendorId) => {
  const order = await Order.findById(orderId)
    .populate('user', 'userName contactNumber email address')
    .populate('items.product', 'productName thumbnail description')
    .populate('items.vendor', 'storeName storeId storeAddress')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber');

  if (!order) {
    return null;
  }

  // Check if order has items from this vendor
  const vendorItems = order.items.filter(item => 
    item.vendor && item.vendor._id.toString() === vendorId.toString()
  );

  if (vendorItems.length === 0) {
    return null; // Order doesn't belong to this vendor
  }

  const orderObj = order.toObject();
  orderObj.items = vendorItems;

  // Calculate vendor-specific pricing
  const vendorItemsSubtotal = vendorItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const vendorItemsCashback = vendorItems.reduce((sum, item) => sum + (item.cashback || 0), 0);

  orderObj.vendorPricing = {
    itemsSubtotal: parseFloat(vendorItemsSubtotal.toFixed(2)),
    itemsCashback: parseFloat(vendorItemsCashback.toFixed(2)),
    itemCount: vendorItems.length,
  };

  return orderObj;
};

/**
 * Update order status (for vendor)
 */
exports.updateOrderStatus = async (orderId, vendorId, status) => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error('Order not found');
  }

  // Check if order has items from this vendor
  const vendorItems = order.items.filter(item => 
    item.vendor && item.vendor.toString() === vendorId.toString()
  );

  if (vendorItems.length === 0) {
    throw new Error('Order does not belong to this vendor');
  }

  // Validate status transition
  const validStatuses = ['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }

  // Update order status
  order.status = status;

  // Set timestamps based on status
  if (status === 'ready') {
    // Ready for pickup
  } else if (status === 'out_for_delivery') {
    // Out for delivery
  } else if (status === 'delivered') {
    order.deliveredAt = new Date();
  } else if (status === 'cancelled') {
    order.cancelledAt = new Date();
    order.cancelledBy = 'vendor';
  }

  await order.save();

  return await Order.findById(order._id)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code')
    .populate('rider', 'fullName mobileNumber');
};

/**
 * Cancel order
 */
exports.cancelOrder = async (orderId, userId, reason = '') => {
  const order = await Order.findOne({ _id: orderId, user: userId });

  if (!order) {
    throw new Error('Order not found');
  }

  if (!['pending', 'confirmed', 'processing'].includes(order.status)) {
    throw new Error('Order cannot be cancelled at this stage');
  }

  // Restore inventory
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product) {
      if (product.skus && product.skus.length > 0 && item.sku) {
        const skuItem = product.skus.find(s => s.sku === item.sku);
        if (skuItem) {
          skuItem.inventory += item.quantity;
        }
      } else {
        product.inventory += item.quantity;
      }
      await product.save();
    }
  }

  // Update order
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledBy = 'user';
  order.cancellationReason = reason;
  order.payment.status = order.payment.method === 'cod' ? 'failed' : 'refunded';

  await order.save();

  return await Order.findById(order._id)
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code');
};



