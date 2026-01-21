const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Rider = require('../models/Rider');
const RiderJobApplication = require('../models/RiderJobApplication');
const { notificationQueue } = require('../utils/queue');
const { sendOrderAssignmentRequestToRiders } = require('../utils/socket');
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
  let cart = await Cart.findOne({ user: userId });

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

  const unitPrice = product.salePrice || product.regularPrice || product.actualPrice;
  
  const totalPrice = unitPrice * quantity;

  let thumbnail = undefined;
  if (product.images && product.images.length > 0 && product.images[0].url) {
    thumbnail = {
      url: product.images[0].url,
      publicId: product.images[0].publicId || undefined,
    };
  } else if (product.thumbnail && product.thumbnail.url) {
    thumbnail = {
      url: product.thumbnail.url,
      publicId: product.thumbnail.publicId || undefined,
    };
  }

  const existingItemIndex = cart.items.findIndex(
    item => item.product.toString() === productId.toString() && item.sku === sku
  );

  if (existingItemIndex > -1) {
    const newQuantity = cart.items[existingItemIndex].quantity + quantity;
    if (newQuantity > availableInventory) {
      throw new Error(`Only ${availableInventory} items available in stock`);
    }
    const newTotalPrice = unitPrice * newQuantity;
    cart.items[existingItemIndex].quantity = newQuantity;
    cart.items[existingItemIndex].price = unitPrice;
    cart.items[existingItemIndex].unitPrice = unitPrice;
    cart.items[existingItemIndex].totalPrice = newTotalPrice;
    if (thumbnail) {
      cart.items[existingItemIndex].thumbnail = thumbnail;
    }
  } else {
    cart.items.push({
      product: productId,
      quantity,
      sku,
      price: unitPrice,
      unitPrice: unitPrice,
      totalPrice: totalPrice,
      thumbnail: thumbnail,
    });
  }

  await cart.save();
  return await Cart.findById(cart._id);
};

exports.updateCartItem = async (userId, itemId, quantity) => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  // Find item in this user's cart only
  const item = cart.items.id(itemId);
  if (!item) {
    throw new Error('Item not found in your cart');
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

    const unitPrice = product.salePrice || product.regularPrice || product.actualPrice;
    const totalPrice = unitPrice * quantity;

    let thumbnail = undefined;
    if (product.images && product.images.length > 0 && product.images[0].url) {
      thumbnail = {
        url: product.images[0].url,
        publicId: product.images[0].publicId || undefined,
      };
    } else if (product.thumbnail && product.thumbnail.url) {
      // Fall back to thumbnail if no images are available
      thumbnail = {
        url: product.thumbnail.url,
        publicId: product.thumbnail.publicId || undefined,
      };
    }

    item.quantity = quantity;
    item.price = unitPrice;
    item.unitPrice = unitPrice;
    item.totalPrice = totalPrice;
    if (thumbnail) {
      item.thumbnail = thumbnail;
    }
  }

  await cart.save();
  return await Cart.findById(cart._id);
};

exports.removeFromCart = async (userId, itemId) => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  // Verify item exists in this user's cart
  const item = cart.items.id(itemId);
  if (!item) {
    throw new Error('Item not found in your cart');
  }

  cart.items.pull(itemId);
  await cart.save();

  return await Cart.findById(cart._id);
};

/**
 * Clear cart
 */
exports.clearCart = async (userId) => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
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
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
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

  return await Cart.findById(cart._id).populate('coupon.couponId');
};

/**
 * Remove coupon from cart
 */
exports.removeCoupon = async (userId) => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  cart.coupon = undefined;
  await cart.save();

  return await Cart.findById(cart._id);
};

exports.getCartWithTotals = async (userId) => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId }).populate('coupon.couponId');

  // Verify cart ownership if cart exists
  if (cart && cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  if (!cart || !cart.items || cart.items.length === 0) {
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
      totalPrice: 0,
    };
  }

  const Product = require('../models/Product');
  const Coupon = require('../models/Coupon');

  let subtotal = 0;
  let totalCashback = 0;
  const itemsWithDetails = [];
  const unavailableItems = [];

  for (const item of cart.items) {
    const product = await Product.findById(item.product)
      .populate('vendor', 'storeName storeId isActive');

    if (!product) {
      unavailableItems.push({
        itemId: item._id,
        reason: 'Product not found',
      });
      continue;
    }

    if (!product.vendor || !product.vendor.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: 'Vendor is inactive',
      });
      continue;
    }

    if (!product.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: 'Product is inactive',
      });
      continue;
    }

    const approvalStatus = product.approvalStatus ? String(product.approvalStatus).trim().toLowerCase() : null;

    if (!approvalStatus || approvalStatus !== 'approved') {
      const statusMessages = {
        'pending': 'Product is pending approval',
        'rejected': 'Product has been rejected',
      };
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: statusMessages[approvalStatus] || `Product status is ${product.approvalStatus}`,
      });
      continue;
    }

    const availableInventory = product.skus && product.skus.length > 0
      ? product.skus.find(s => s.sku === item.sku)?.inventory || 0
      : product.inventory;

    if (availableInventory < item.quantity) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: `Only ${availableInventory} items available in stock`,
      });
      continue;
    }

    // Check for active offer on this product (from Product model)
    let unitPrice;
    const now = new Date();
    let isOfferActive = false;
    
    if (product.offerEnabled && product.offerDiscountPercentage > 0) {
      // Check date range if dates are set
      if (product.offerStartDate && product.offerEndDate) {
        const startDate = new Date(product.offerStartDate);
        const endDate = new Date(product.offerEndDate);
        isOfferActive = now >= startDate && now <= endDate;
      } else if (product.offerStartDate) {
        const startDate = new Date(product.offerStartDate);
        isOfferActive = now >= startDate;
      } else if (product.offerEndDate) {
        const endDate = new Date(product.offerEndDate);
        isOfferActive = now <= endDate;
      } else {
        isOfferActive = true;
      }
    }
    
    if (isOfferActive) {
      const basePrice = product.regularPrice || product.salePrice || product.actualPrice;
      const discountAmount = (basePrice * product.offerDiscountPercentage) / 100;
      unitPrice = basePrice - discountAmount;
    } else {
      unitPrice = item.unitPrice || item.price || (product.salePrice || product.regularPrice || product.actualPrice);
    }
    
    const itemTotal = item.totalPrice || (unitPrice * item.quantity);
    const itemCashback = (product.cashback || 0) * item.quantity;

    subtotal += itemTotal;
    totalCashback += itemCashback;

    const vendorId = product.vendor && typeof product.vendor === 'object' && product.vendor._id
      ? product.vendor._id
      : product.vendor;

    let thumbnail = undefined;
    if (item.thumbnail && item.thumbnail.url) {
      thumbnail = {
        url: item.thumbnail.url,
        publicId: item.thumbnail.publicId || undefined,
      };
    } else if (product.images && product.images.length > 0 && product.images[0].url) {
      // Use first image from images array
      thumbnail = {
        url: product.images[0].url || undefined,
        publicId: product.images[0].publicId || undefined,
      };
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    } else if (product.thumbnail && typeof product.thumbnail === 'object' && product.thumbnail.url) {
      // Fall back to thumbnail if no images are available
      thumbnail = {
        url: product.thumbnail.url || undefined,
        publicId: product.thumbnail.publicId || undefined,
      };
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    }

    itemsWithDetails.push({
      itemId: item._id,
      product: product._id,
      vendor: vendorId,
      productName: product.productName,
      thumbnail: thumbnail,
      quantity: item.quantity,
      unitPrice: unitPrice,
      salePrice: unitPrice,
      price: unitPrice,
      totalPrice: itemTotal,
      cashback: itemCashback,
      sku: item.sku,
    });
  }

  let discount = 0;
  if (cart.coupon && cart.coupon.couponId) {
    const coupon = await Coupon.findById(cart.coupon.couponId);
    if (coupon && coupon.isValid()) {
      const discountResult = coupon.calculateDiscount(subtotal);
      if (discountResult.valid) {
        discount = discountResult.discount;
      }
    }
  }

  const shipping = subtotal >= 500 ? 0 : 50;
  const tax = (subtotal - discount) * 0.05;
  const total = subtotal - discount + shipping + tax;

  if (unavailableItems.length > 0) {
    const itemIdsToRemove = unavailableItems.map(item => item.itemId);
    cart.items = cart.items.filter(item => !itemIdsToRemove.includes(item._id.toString()));
    cart.totalPrice = parseFloat(total.toFixed(2));
    await cart.save();
  } else {
    cart.totalPrice = parseFloat(total.toFixed(2));
    await cart.save();
  }

  const cartData = cart.toObject();
  delete cartData.items;

  return {
    cart: {
      ...cartData,
      items: itemsWithDetails.map(item => ({
        _id: item.itemId,
        product: item.product,
        quantity: item.quantity,
        sku: item.sku,
        price: item.price,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        thumbnail: item.thumbnail,
        addedAt: cart.items.find(i => i._id.toString() === item.itemId.toString())?.addedAt,
      })),
    },
    items: itemsWithDetails,
    unavailableItems: unavailableItems,
    pricing: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      totalCashback: parseFloat(totalCashback.toFixed(2)),
    },
    totalPrice: parseFloat(total.toFixed(2)),
  };
};

/**
 * Create order from cart
 */
exports.createOrder = async (userId, shippingAddress, paymentMethod, notes = '') => {
  // Find cart for the specific user only
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  // Verify the cart belongs to the user (additional security check)
  if (cart.user.toString() !== userId.toString()) {
    logger.error(`Cart ownership mismatch: cart user ${cart.user} vs requested user ${userId}`);
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  if (cart.items.length === 0) {
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

  // Validate and update inventory, and collect product images
  const productImagesMap = new Map();
  for (const item of totals.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product ${item.product} not found`);
    }

    // Get first image from product
    if (product.images && product.images.length > 0) {
      const firstImage = product.images[0];
      productImagesMap.set(item.product.toString(), {
        url: firstImage.url,
        publicId: firstImage.publicId,
        mediaType: firstImage.mediaType || 'image',
      });
    } else if (product.thumbnail && product.thumbnail.url) {
      // Fallback to thumbnail if no images
      productImagesMap.set(item.product.toString(), {
        url: product.thumbnail.url,
        publicId: product.thumbnail.publicId,
        mediaType: 'image',
      });
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

  // Clean up items - ensure thumbnail and image are properly formatted (not null)
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
    
    // Add first image from product
    const productImage = productImagesMap.get(item.product.toString());
    if (productImage) {
      cleanedItem.image = {
        url: productImage.url,
        publicId: productImage.publicId || undefined,
        mediaType: productImage.mediaType || 'image',
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

  // Add cashback to user account
  const totalCashback = totals.pricing?.totalCashback || 0;
  logger.info(`Processing cashback for order ${orderNumber}: totalCashback = ${totalCashback}`);
  
  if (totalCashback > 0) {
    try {
      const user = await User.findById(userId);
      if (user) {
        const previousCashback = user.cashback || 0;
        const newCashback = previousCashback + totalCashback;
        user.cashback = newCashback;
        await user.save();
        
        // Verify cashback was saved
        const updatedUser = await User.findById(userId).select('cashback');
        if (updatedUser && updatedUser.cashback === newCashback) {
          logger.info(`✓ Cashback ${totalCashback} successfully added to user ${userId} account for order ${orderNumber}. Previous: ${previousCashback}, New: ${updatedUser.cashback}`);
        } else {
          logger.error(`✗ Cashback save verification failed for user ${userId} order ${orderNumber}. Expected: ${newCashback}, Got: ${updatedUser?.cashback}`);
        }
      } else {
        logger.error(`User ${userId} not found when trying to add cashback for order ${orderNumber}`);
      }
    } catch (error) {
      logger.error(`Error adding cashback to user ${userId} account for order ${orderNumber}:`, error);
      // Don't throw error, just log it - order should still be created
    }
  } else {
    logger.info(`No cashback to add for order ${orderNumber} (totalCashback: ${totalCashback})`);
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
 * Get order by ID or order number
 */
exports.getOrderById = async (orderId, userId = null) => {
  const mongoose = require('mongoose');
  let query = {};
  
  // Check if orderId is a valid ObjectId, otherwise search by orderNumber
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    query._id = orderId;
  } else {
    query.orderNumber = orderId;
  }
  
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
 * Get vendor order by ID or order number
 */
exports.getVendorOrderById = async (orderId, vendorId) => {
  let order;
  const mongoose = require('mongoose');
  
  // Check if orderId is a valid ObjectId, otherwise search by orderNumber
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email address')
      .populate('items.product', 'productName thumbnail description')
      .populate('items.vendor', 'storeName storeId storeAddress')
      .populate('coupon.couponId', 'couponName code offerType')
      .populate('rider', 'fullName mobileNumber');
  } else {
    // Search by orderNumber
    order = await Order.findOne({ orderNumber: orderId })
      .populate('user', 'userName contactNumber email address')
      .populate('items.product', 'productName thumbnail description')
      .populate('items.vendor', 'storeName storeId storeAddress')
      .populate('coupon.couponId', 'couponName code offerType')
      .populate('rider', 'fullName mobileNumber');
  }

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
 * Notify riders when order is ready for delivery
 */
exports.notifyRidersForOrder = async (order) => {
  try {
    // Get unique vendor IDs from order items
    const vendorIds = [...new Set(order.items.map(item => {
      const vendorId = item.vendor?._id || item.vendor;
      return vendorId?.toString();
    }).filter(Boolean))];

    if (vendorIds.length === 0) {
      logger.warn(`No vendors found for order ${order.orderNumber}`);
      return;
    }

    // Find riders who work for these vendors (direct vendor assignment from Rider model)
    const ridersForVendors = await Rider.find({
      vendor: { $in: vendorIds },
      isActive: true,
      approvalStatus: 'approved',
    }).select('_id fullName mobileNumber');

    const activeRiders = ridersForVendors.map(r => r._id.toString());

    if (activeRiders.length === 0) {
      logger.info(`No active riders found for vendors in order ${order.orderNumber}`);
      return;
    }

    // Create assignment requests for each rider
    const assignmentRequests = activeRiders.map(riderId => ({
      rider: riderId,
      requestedAt: new Date(),
      status: 'pending',
    }));

    // Update order with assignment requests
    order.assignmentRequestSentAt = new Date();
    order.assignmentRequestSentTo = assignmentRequests;
    await order.save();

    // Prepare order data for WebSocket with amount and location
    const orderData = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items,
      shippingAddress: {
        line1: order.shippingAddress?.line1 || '',
        line2: order.shippingAddress?.line2 || '',
        pinCode: order.shippingAddress?.pinCode || '',
        city: order.shippingAddress?.city || '',
        state: order.shippingAddress?.state || '',
        country: order.shippingAddress?.country || '',
        latitude: order.shippingAddress?.latitude || null,
        longitude: order.shippingAddress?.longitude || null,
        fullAddress: [
          order.shippingAddress?.line1,
          order.shippingAddress?.line2,
          order.shippingAddress?.city,
          order.shippingAddress?.state,
          order.shippingAddress?.pinCode,
          order.shippingAddress?.country
        ].filter(Boolean).join(', ')
      },
      pricing: {
        subtotal: order.pricing?.subtotal || 0,
        discount: order.pricing?.discount || 0,
        shipping: order.pricing?.shipping || 0,
        tax: order.pricing?.tax || 0,
        total: order.pricing?.total || 0,
        totalCashback: order.pricing?.totalCashback || 0,
        deliveryAmount: order.deliveryAmount || order.pricing?.shipping || 0, // Delivery amount for rider
      },
      amount: order.pricing?.total || 0, // Total order amount
      deliveryAmount: order.deliveryAmount || order.pricing?.shipping || 0, // Delivery amount for rider
      location: {
        address: [
          order.shippingAddress?.line1,
          order.shippingAddress?.line2,
          order.shippingAddress?.city,
          order.shippingAddress?.state,
          order.shippingAddress?.pinCode
        ].filter(Boolean).join(', '),
        city: order.shippingAddress?.city || '',
        state: order.shippingAddress?.state || '',
        pinCode: order.shippingAddress?.pinCode || '',
        coordinates: {
          latitude: order.shippingAddress?.latitude || null,
          longitude: order.shippingAddress?.longitude || null,
        }
      },
      createdAt: order.createdAt,
    };

    // Send WebSocket notifications to riders
    try {
      const sentCount = await sendOrderAssignmentRequestToRiders(activeRiders, orderData);
      logger.info(`Sent assignment requests via WebSocket to ${sentCount} connected riders for order ${order.orderNumber}`);
      
      // Also send to notification queue for offline riders (optional fallback)
      if (notificationQueue) {
        for (const riderId of activeRiders) {
          const rider = await Rider.findById(riderId);
          if (rider) {
            await notificationQueue.add({
              userId: riderId,
              type: 'order_assignment_request',
              title: 'New Order Assignment Available',
              message: `Order ${order.orderNumber} is ready for delivery. Amount: ₹${orderData.amount || 0}, Delivery: ₹${orderData.deliveryAmount || 0}. Would you like to accept?`,
              data: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                type: 'rider',
                // Include amount and location
                amount: orderData.amount || 0,
                deliveryAmount: orderData.deliveryAmount || 0,
                pricing: orderData.pricing,
                location: orderData.location,
                shippingAddress: orderData.shippingAddress,
                order: orderData,
              },
            });
          }
        }
      }
    } catch (socketError) {
      logger.error(`Error sending WebSocket notifications: ${socketError.message}`);
      // Fallback to notification queue if WebSocket fails
      if (notificationQueue) {
        for (const riderId of activeRiders) {
          const rider = await Rider.findById(riderId);
          if (rider) {
            await notificationQueue.add({
              userId: riderId,
              type: 'order_assignment_request',
              title: 'New Order Assignment Available',
              message: `Order ${order.orderNumber} is ready for delivery. Amount: ₹${orderData.amount || 0}, Delivery: ₹${orderData.deliveryAmount || 0}. Would you like to accept?`,
              data: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                type: 'rider',
                // Include amount and location
                amount: orderData.amount || 0,
                deliveryAmount: orderData.deliveryAmount || 0,
                pricing: orderData.pricing,
                location: orderData.location,
                shippingAddress: orderData.shippingAddress,
                order: orderData,
              },
            });
          }
        }
      }
    }

    logger.info(`Sent assignment requests to ${activeRiders.length} riders for order ${order.orderNumber}`);
  } catch (error) {
    logger.error(`Error notifying riders for order ${order.orderNumber}:`, error);
  }
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
    // Ready for pickup - notify riders
    await exports.notifyRidersForOrder(order);
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







