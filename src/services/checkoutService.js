const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Rider = require('../models/Rider');
const RiderJobApplication = require('../models/RiderJobApplication');
const { notificationQueue } = require('../utils/queue');
const { sendOrderAssignmentRequestToRiders } = require('../utils/socket');
const logger = require('../utils/logger');

/**
 * Update vendor revenue and product sales tracking
 * @param {Object} order - Order object
 * @param {Array} itemsToTrack - Optional: specific items to track (if not provided, tracks all items)
 */
const updateVendorRevenue = async (order, itemsToTrack = null) => {
  try {
    const orderDate = order.createdAt || new Date();
    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    
    // Use provided items or all order items
    const items = itemsToTrack || order.items;
    
    // Group items by vendor
    const vendorItemsMap = new Map();
    
    for (const item of items) {
      const vendorId = item.vendor?._id || item.vendor;
      if (!vendorId) continue;
      
      const vendorIdStr = vendorId.toString();
      if (!vendorItemsMap.has(vendorIdStr)) {
        vendorItemsMap.set(vendorIdStr, []);
      }
      vendorItemsMap.get(vendorIdStr).push(item);
    }
    
    // Update revenue for each vendor
    for (const [vendorIdStr, vendorItems] of vendorItemsMap.entries()) {
      const vendor = await Vendor.findById(vendorIdStr);
      if (!vendor) {
        continue;
      }
      
      // Calculate total revenue for this vendor's items
      let vendorRevenue = 0;
      for (const item of vendorItems) {
        vendorRevenue += item.totalPrice || 0;
        
        // Add product sales entry
        const productSalesEntry = {
          product: item.product?._id || item.product,
          productName: item.productName || 'Unknown Product',
          month: monthKey,
          quantity: item.quantity || 0,
          revenue: item.totalPrice || 0,
          orderId: order._id,
          orderNumber: order.orderNumber,
          createdAt: orderDate,
        };
        
        vendor.productSales.push(productSalesEntry);
      }
      
      // Update month-wise revenue
      if (!vendor.revenue) {
        vendor.revenue = new Map();
      }
      const currentMonthRevenue = vendor.revenue.get(monthKey) || 0;
      vendor.revenue.set(monthKey, currentMonthRevenue + vendorRevenue);
      
      await vendor.save();
    }
  } catch (error) {
    // Don't throw error - revenue tracking failure shouldn't break order creation
  }
};

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
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  // Find item in this user's cart only
  const item = cart.items.id(itemId);
  if (!item) {
    throw new Error('Item not found in your cart');
  }

  if (quantity <= 0) {
    cart.items.pull(itemId);
  } else {
    // Check if product ID exists
    if (!item.product) {
      cart.items.pull(itemId);
      await cart.save();
      throw new Error('Product reference is missing from cart item. Item has been removed from cart');
    }

    // Convert product ID to string if it's an ObjectId
    const productId = item.product.toString ? item.product.toString() : item.product;
    
    const product = await Product.findById(productId)
      .populate('vendor', 'storeName storeId isActive');
    
    if (!product) {
      cart.items.pull(itemId);
      await cart.save();
      throw new Error('Product not found. Item has been removed from cart');
    }
    
    // Validate product availability
    const validation = validateProductAvailability(product);
    if (!validation.available) {
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
          cart.items.pull(itemId);
          await cart.save();
          throw new Error(`Invalid SKU for this product. Item has been removed from cart`);
        }
        availableInventory = skuItem.inventory;
      } else {
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
    throw new Error('Unauthorized: Cart does not belong to this user');
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return {
      items: [],
      unavailableItems: [],
      pricing: {
        subtotal: 0,
        discount: 0,
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
  let totalTax = 0;
  const itemsWithDetails = [];
  const unavailableItems = [];

  // Get unique vendor IDs to fetch handling charge percentages
  const vendorIds = [];
  for (const item of cart.items) {
    const product = await Product.findById(item.product).select('vendor');
    if (product && product.vendor) {
      const vendorId = product.vendor.toString();
      if (!vendorIds.includes(vendorId)) {
        vendorIds.push(vendorId);
      }
    }
  }

  // Fetch vendors with handling charge percentages
  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id handlingChargePercentage');
  const vendorHandlingChargeMap = new Map();
  vendors.forEach(vendor => {
    vendorHandlingChargeMap.set(vendor._id.toString(), vendor.handlingChargePercentage || 0);
  });

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
    // Calculate tax amount from percentage: (itemTotal * tax%) / 100
    const itemTax = (itemTotal * (product.tax || 0)) / 100;

    subtotal += itemTotal;
    totalCashback += itemCashback;
    totalTax += itemTax;

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
      tax: itemTax,
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

  // Calculate handling charge based on vendor's handling charge percentage
  // Group items by vendor and calculate handling charge for each vendor's items
  const vendorItemsMap = new Map();
  itemsWithDetails.forEach(item => {
    const vendorId = item.vendor?.toString() || item.vendor;
    if (vendorId) {
      if (!vendorItemsMap.has(vendorId)) {
        vendorItemsMap.set(vendorId, []);
      }
      vendorItemsMap.get(vendorId).push(item);
    }
  });

  let totalHandlingCharge = 0;
  vendorItemsMap.forEach((items, vendorId) => {
    const handlingChargePercentage = vendorHandlingChargeMap.get(vendorId) || 0;
    if (handlingChargePercentage > 0) {
      const vendorItemsSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const vendorHandlingCharge = (vendorItemsSubtotal * handlingChargePercentage) / 100;
      totalHandlingCharge += vendorHandlingCharge;
    }
  });

  // Tax is calculated from individual product taxes (sum of all item taxes)
  const tax = totalTax;
  const total = subtotal - discount + tax + totalHandlingCharge;

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
      tax: parseFloat(tax.toFixed(2)),
      handlingCharge: parseFloat(totalHandlingCharge.toFixed(2)),
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

  // Add cashback to user account (ecashback)
  const totalCashback = totals.pricing?.totalCashback || 0;
  
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
        logger.info(`Cashback added to user ${userId} for order ${orderNumber}: Previous: ₹${previousCashback}, Added: ₹${totalCashback}, New Total: ₹${updatedUser?.cashback || newCashback}`);
      } else {
        logger.warn(`User ${userId} not found when trying to add cashback for order ${orderNumber}`);
      }
    } catch (error) {
      // Don't throw error, just log it - order should still be created
      logger.error(`Error adding cashback to user ${userId} for order ${orderNumber}:`, error);
    }
  } else {
    logger.info(`No cashback to add for order ${orderNumber} (totalCashback: ${totalCashback})`);
  }

  // Clear cart
  cart.items = [];
  cart.coupon = undefined;
  await cart.save();

  // Update vendor revenue tracking
  await updateVendorRevenue(order);

  /**
   * Automatically generate invoices for each vendor when order is placed by user
   * This ensures that invoices are created immediately upon order placement
   * Each vendor in the order gets a separate invoice
   */
  try {
    const { createInvoice } = require('../controllers/invoice');
    
    // Get unique vendors from order items
    const uniqueVendors = [...new Set(order.items.map(item => {
      const vendor = item.vendor?._id || item.vendor;
      return vendor.toString();
    }))];
    
    // Create invoice for each vendor
    for (const vendorId of uniqueVendors) {
      try {
        await createInvoice(order._id, vendorId);
        logger.info(`Invoice automatically generated for vendor ${vendorId} on order ${order.orderNumber}`);
      } catch (invoiceError) {
        // Log error but don't fail the order creation
        logger.error(`Failed to generate invoice for vendor ${vendorId}:`, invoiceError);
      }
    }
  } catch (error) {
    // Log error but don't fail the order creation
    logger.error('Error generating invoices for order:', error);
  }

  /**
   * Create notifications and send socket.io notifications to vendors when order is created
   * Each vendor in the order gets a notification about the new order
   */
  try {
    const Notification = require('../models/Notification');
    const { sendVendorPushNotification } = require('../utils/firebaseNotification');
    
    // Get unique vendors from order items with their items
    const vendorItemsMap = new Map();
    order.items.forEach(item => {
      const vendorId = (item.vendor?._id || item.vendor).toString();
      if (!vendorItemsMap.has(vendorId)) {
        vendorItemsMap.set(vendorId, []);
      }
      vendorItemsMap.get(vendorId).push(item);
    });
    
    // Create notification and send push notification for each vendor
    for (const [vendorId, vendorItems] of vendorItemsMap) {
      try {
        // Calculate vendor-specific total
        const vendorTotal = vendorItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const itemCount = vendorItems.length;
        const itemNames = vendorItems.map(item => item.productName).join(', ');
        
        // Create notification in database
        const notification = await Notification.create({
          recipient: vendorId,
          recipientModel: 'Vendor',
          type: 'order_created',
          title: 'New Order Received',
          message: `You have received a new order #${order.orderNumber} with ${itemCount} item(s): ${itemNames.substring(0, 100)}${itemNames.length > 100 ? '...' : ''}. Total: ₹${vendorTotal.toFixed(2)}`,
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            itemCount: itemCount,
            total: vendorTotal,
            items: vendorItems.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            shippingAddress: order.shippingAddress,
            paymentMethod: order.payment?.method,
            createdAt: order.createdAt,
          },
          order: order._id,
          isRead: false,
        });
        
        // Send push notification to vendor
        await sendVendorPushNotification(vendorId, {
          type: 'order_created',
          title: 'New Order Received',
          message: `You have received a new order #${order.orderNumber} with ${itemCount} item(s). Total: ₹${vendorTotal.toFixed(2)}`,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            itemCount: itemCount,
            total: vendorTotal,
            items: vendorItems.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            shippingAddress: order.shippingAddress,
            paymentMethod: order.payment?.method,
            createdAt: order.createdAt,
          },
          order: order._id,
        });
        
        logger.info(`Notification created and sent to vendor ${vendorId} for order ${order.orderNumber}`);
      } catch (notificationError) {
        // Log error but don't fail the order creation
        logger.error(`Failed to create/send notification to vendor ${vendorId}:`, notificationError);
      }
    }
  } catch (error) {
    // Log error but don't fail the order creation
    logger.error('Error creating/sending notifications to vendors:', error);
  }

  return await Order.findById(order._id)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber');
};

/**
 * Reorder - Create a new order from a previous order
 */
exports.reorder = async (userId, orderId) => {
  const mongoose = require('mongoose');
  
  // Find the original order
  let originalOrder;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    originalOrder = await Order.findById(orderId)
      .populate('items.product')
      .populate('items.vendor', 'isActive');
  } else {
    originalOrder = await Order.findOne({ orderNumber: orderId })
      .populate('items.product')
      .populate('items.vendor', 'isActive');
  }

  if (!originalOrder) {
    throw new Error('Order not found');
  }

  // Verify the order belongs to the user
  if (originalOrder.user.toString() !== userId.toString()) {
    throw new Error('Unauthorized: Order does not belong to this user');
  }

  if (!originalOrder.items || originalOrder.items.length === 0) {
    throw new Error('Order has no items to reorder');
  }

  // Validate products and check availability
  const validItems = [];
  const unavailableItems = [];

  for (const item of originalOrder.items) {
    const product = await Product.findById(item.product);
    
    if (!product) {
      unavailableItems.push({
        productName: item.productName,
        reason: 'Product no longer exists',
      });
      continue;
    }

    // Validate product availability
    const validation = validateProductAvailability(product);
    if (!validation.available) {
      unavailableItems.push({
        productName: item.productName,
        reason: validation.reason,
      });
      continue;
    }

    // Check inventory
    let availableInventory = product.inventory;
    if (product.skus && product.skus.length > 0) {
      if (item.sku) {
        const skuItem = product.skus.find(s => s.sku === item.sku);
        if (!skuItem) {
          unavailableItems.push({
            productName: item.productName,
            reason: 'SKU no longer available',
          });
          continue;
        }
        availableInventory = skuItem.inventory;
      } else {
        unavailableItems.push({
          productName: item.productName,
          reason: 'SKU is required for this product',
        });
        continue;
      }
    }

    if (availableInventory < item.quantity) {
      unavailableItems.push({
        productName: item.productName,
        reason: `Only ${availableInventory} items available in stock`,
      });
      continue;
    }

    // Get current prices
    const unitPrice = product.salePrice || product.regularPrice || product.actualPrice;
    const salePrice = product.salePrice || product.regularPrice || product.actualPrice;
    const totalPrice = salePrice * item.quantity;
    const cashback = product.cashback ? (product.cashback * item.quantity) : (item.cashback || 0);

    // Get product images
    let thumbnail = undefined;
    let image = undefined;
    
    if (product.images && product.images.length > 0) {
      const firstImage = product.images[0];
      image = {
        url: firstImage.url,
        publicId: firstImage.publicId || undefined,
        mediaType: firstImage.mediaType || 'image',
      };
      thumbnail = {
        url: firstImage.url,
        publicId: firstImage.publicId || undefined,
      };
    } else if (product.thumbnail && product.thumbnail.url) {
      thumbnail = {
        url: product.thumbnail.url,
        publicId: product.thumbnail.publicId || undefined,
      };
      image = {
        url: product.thumbnail.url,
        publicId: product.thumbnail.publicId || undefined,
        mediaType: 'image',
      };
    }

    validItems.push({
      product: item.product,
      vendor: item.vendor,
      productName: product.productName,
      thumbnail: thumbnail,
      image: image,
      quantity: item.quantity,
      unitPrice: unitPrice,
      salePrice: salePrice,
      totalPrice: totalPrice,
      cashback: cashback,
      sku: item.sku || undefined,
    });
  }

  if (validItems.length === 0) {
    const reasons = unavailableItems.map(item => 
      `${item.productName || 'Product'}: ${item.reason}`
    ).join(', ');
    throw new Error(`Cannot reorder. Some products are not available: ${reasons}`);
  }

  // Update inventory for valid items
  for (const item of validItems) {
    const product = await Product.findById(item.product);
    
    if (product.skus && product.skus.length > 0 && item.sku) {
      const skuItem = product.skus.find(s => s.sku === item.sku);
      if (skuItem) {
        skuItem.inventory -= item.quantity;
      }
    } else {
      product.inventory -= item.quantity;
    }
    
    await product.save();
  }

  // Calculate pricing
  const subtotal = validItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalCashback = validItems.reduce((sum, item) => sum + (item.cashback || 0), 0);
  
  // No discount for reorder (coupon not applied)
  const discount = 0;
  
  // Calculate handling charge based on vendor's handling charge percentage
  const vendorIds = [...new Set(validItems.map(item => item.vendor.toString()))];
  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id handlingChargePercentage');
  const vendorHandlingChargeMap = new Map();
  vendors.forEach(vendor => {
    vendorHandlingChargeMap.set(vendor._id.toString(), vendor.handlingChargePercentage || 0);
  });

  // Group items by vendor and calculate handling charge
  const vendorItemsMap = new Map();
  validItems.forEach(item => {
    const vendorId = item.vendor.toString();
    if (!vendorItemsMap.has(vendorId)) {
      vendorItemsMap.set(vendorId, []);
    }
    vendorItemsMap.get(vendorId).push(item);
  });

  let totalHandlingCharge = 0;
  vendorItemsMap.forEach((items, vendorId) => {
    const handlingChargePercentage = vendorHandlingChargeMap.get(vendorId) || 0;
    if (handlingChargePercentage > 0) {
      const vendorItemsSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const vendorHandlingCharge = (vendorItemsSubtotal * handlingChargePercentage) / 100;
      totalHandlingCharge += vendorHandlingCharge;
    }
  });

  // Calculate tax (GST - 5% as per cart calculation)
  const tax = (subtotal - discount) * 0.05;
  
  const total = subtotal - discount + tax + totalHandlingCharge;

  // Generate new order number
  const orderNumber = await Order.generateOrderNumber();

  // Create new order
  const newOrder = await Order.create({
    orderNumber,
    user: userId,
    items: validItems,
    pricing: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      handlingCharge: parseFloat(totalHandlingCharge.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      totalCashback: parseFloat(totalCashback.toFixed(2)),
    },
    shippingAddress: originalOrder.shippingAddress,
    payment: {
      method: originalOrder.payment.method,
      status: originalOrder.payment.method === 'cod' ? 'pending' : 'processing',
      amount: total,
    },
    notes: `Reordered from order ${originalOrder.orderNumber}`,
    status: 'pending',
  });

  // Add cashback to user account (ecashback) for reorder
  if (totalCashback > 0) {
    try {
      const user = await User.findById(userId);
      if (user) {
        const previousCashback = user.cashback || 0;
        const newCashback = previousCashback + totalCashback;
        user.cashback = newCashback;
        await user.save();
        
        logger.info(`Cashback added to user ${userId} for reorder ${orderNumber}: Previous: ₹${previousCashback}, Added: ₹${totalCashback}, New Total: ₹${newCashback}`);
      } else {
        logger.warn(`User ${userId} not found when trying to add cashback for reorder ${orderNumber}`);
      }
    } catch (error) {
      logger.error(`Error adding cashback to user ${userId} for reorder ${orderNumber}:`, error);
    }
  }

  // Update vendor revenue tracking
  await updateVendorRevenue(newOrder);

  /**
   * Create notifications and send socket.io notifications to vendors when order is reordered
   * Each vendor in the order gets a notification about the new order
   */
  try {
    const Notification = require('../models/Notification');
    const { sendVendorPushNotification } = require('../utils/firebaseNotification');
    
    // Get unique vendors from order items with their items
    const vendorItemsMap = new Map();
    newOrder.items.forEach(item => {
      const vendorId = (item.vendor?._id || item.vendor).toString();
      if (!vendorItemsMap.has(vendorId)) {
        vendorItemsMap.set(vendorId, []);
      }
      vendorItemsMap.get(vendorId).push(item);
    });
    
    // Create notification and send push notification for each vendor
    for (const [vendorId, vendorItems] of vendorItemsMap) {
      try {
        // Calculate vendor-specific total
        const vendorTotal = vendorItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const itemCount = vendorItems.length;
        const itemNames = vendorItems.map(item => item.productName).join(', ');
        
        // Create notification in database
        const notification = await Notification.create({
          recipient: vendorId,
          recipientModel: 'Vendor',
          type: 'order_created',
          title: 'New Order Received (Reorder)',
          message: `You have received a new order #${newOrder.orderNumber} (reorder) with ${itemCount} item(s): ${itemNames.substring(0, 100)}${itemNames.length > 100 ? '...' : ''}. Total: ₹${vendorTotal.toFixed(2)}`,
          data: {
            orderId: newOrder._id,
            orderNumber: newOrder.orderNumber,
            itemCount: itemCount,
            total: vendorTotal,
            items: vendorItems.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            shippingAddress: newOrder.shippingAddress,
            paymentMethod: newOrder.payment?.method,
            createdAt: newOrder.createdAt,
            isReorder: true,
          },
          order: newOrder._id,
          isRead: false,
        });
        
        // Send push notification to vendor
        await sendVendorPushNotification(vendorId, {
          type: 'order_created',
          title: 'New Order Received (Reorder)',
          message: `You have received a new order #${newOrder.orderNumber} (reorder) with ${itemCount} item(s). Total: ₹${vendorTotal.toFixed(2)}`,
          orderId: newOrder._id.toString(),
          orderNumber: newOrder.orderNumber,
          data: {
            orderId: newOrder._id.toString(),
            orderNumber: newOrder.orderNumber,
            itemCount: itemCount,
            total: vendorTotal,
            items: vendorItems.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            shippingAddress: newOrder.shippingAddress,
            paymentMethod: newOrder.payment?.method,
            createdAt: newOrder.createdAt,
            isReorder: true,
          },
          order: newOrder._id,
        });
        
        logger.info(`Notification created and sent to vendor ${vendorId} for reorder ${newOrder.orderNumber}`);
      } catch (notificationError) {
        // Log error but don't fail the order creation
        logger.error(`Failed to create/send notification to vendor ${vendorId}:`, notificationError);
      }
    }
  } catch (error) {
    // Log error but don't fail the order creation
    logger.error('Error creating/sending notifications to vendors for reorder:', error);
  }

  return await Order.findById(newOrder._id)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
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
 * If userId is null, returns full order (for admin)
 * If userId is provided, filters by user (for user)
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
    .populate('user', 'userName contactNumber email address')
    .populate('items.product', 'productName thumbnail description')
    .populate('items.vendor', 'vendorName storeName storeId storeAddress')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber')
    .populate('assignedBy', 'vendorName storeName');

  if (!order) {
    return null;
  }

  return order.toObject ? order.toObject() : order;
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
    .populate({
      path: 'items.product',
      select: 'productName thumbnail description category subCategory salePrice',
      populate: [
        { path: 'category', select: 'name' },
        { path: 'subCategory', select: 'name' }
      ]
    })
    .populate('items.vendor', 'storeName storeId vendorName')
    .populate('coupon.couponId', 'couponName code')
    .populate('rider', 'fullName mobileNumber')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Order.countDocuments(query);

  // Helper function to format date to DD/MM/YYYY
  const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Filter items to only show items from this vendor and add required fields
  const ordersWithVendorItems = orders.map(order => {
    const orderObj = { ...order };
    orderObj.items = orderObj.items
      .filter(item => 
        item.vendor && item.vendor._id.toString() === vendorId.toString()
      )
      .map(item => {
        const product = item.product || {};
        return {
          ...item,
          productId: product._id || item.product || null,
          date: formatDate(order.createdAt),
          vendor: item.vendor?.vendorName || item.vendor?.storeName || null,
          category: product.category?.name || null,
          subCategory: product.subCategory?.name || null,
          sellPrice: product.salePrice || item.price || null,
          status: order.status || 'pending',
        };
      });
    
    // Recalculate pricing for vendor's items only
    const vendorItemsSubtotal = orderObj.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
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
 * Get all orders for admin
 */
exports.getAllOrders = async (page = 1, limit = 10, filters = {}) => {
  const skip = (page - 1) * limit;
  const query = {};

  // Apply filters
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.user) {
    query.user = filters.user;
  }

  if (filters.vendor) {
    query['items.vendor'] = filters.vendor;
  }

  if (filters.paymentStatus) {
    query['payment.status'] = filters.paymentStatus;
  }

  if (filters.paymentMethod) {
    query['payment.method'] = filters.paymentMethod;
  }

  // Date range filters
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate);
    }
  }

  // Search by order number
  if (filters.search) {
    query.orderNumber = { $regex: filters.search, $options: 'i' };
  }

  const orders = await Order.find(query)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'vendorName storeName storeId')
    .populate('coupon.couponId', 'couponName code')
    .populate('rider', 'fullName mobileNumber')
    .populate('assignedBy', 'vendorName storeName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Order.countDocuments(query);

  // Helper function to format date to DD/MM/YYYY
  const formatDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format orders for admin list view - simplified with only required fields
  const formattedOrders = orders.map(order => {
    // Get unique vendors from order items
    const vendors = [...new Set(order.items.map(item => {
      const vendor = item.vendor;
      if (vendor && vendor._id) {
        return vendor.vendorName || vendor.storeName || 'N/A';
      }
      return null;
    }).filter(Boolean))];

    return {
      _id: order._id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      date: formatDate(order.createdAt),
      vendor: vendors.length > 0 ? vendors.join(', ') : 'N/A',
      userName: order.user ? (order.user.userName || 'N/A') : 'N/A',
      cartValue: order.pricing ? order.pricing.total : 0,
      paymentStatus: order.payment ? order.payment.status : 'pending',
      status: order.status || 'pending',
    };
  });

  return {
    orders: formattedOrders,
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
      return;
    }

    // Find riders who work for these vendors (direct vendor assignment from Rider model)
    const ridersForVendors = await Rider.find({
      vendor: { $in: vendorIds },
      isActive: true,
      approvalStatus: 'approved',
    }).select('_id fullName mobileNumber');

    if (ridersForVendors.length === 0) {
      return;
    }

    // Filter out riders who have active orders (not delivered, cancelled, or refunded)
    const ridersWithoutActiveOrders = [];
    for (const rider of ridersForVendors) {
      const hasActiveOrder = await Order.findOne({
        rider: rider._id,
        status: { 
          $nin: ['delivered', 'cancelled', 'refunded'] 
        },
      });
      
      // Only include riders who don't have active orders
      if (!hasActiveOrder) {
        ridersWithoutActiveOrders.push(rider._id.toString());
      }
    }

    const activeRiders = ridersWithoutActiveOrders;

    if (activeRiders.length === 0) {
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

    // Fetch user details using order.user
    let userDetails = null;
    if (order.user) {
      const userId = order.user._id || order.user;
      userDetails = await User.findById(userId).select('userName contactNumber email address addresses');
      
      if (userDetails) {
        // Use exact database field names
        userDetails = {
          userName: userDetails.userName || null,
          contactNumber: userDetails.contactNumber || null,
          email: userDetails.email || null,
          address: userDetails.address || null,
          addresses: userDetails.addresses || [],
        };
      }
    }

    // Fetch vendor addresses for all vendors in the order
    const vendorAddresses = [];
    if (vendorIds.length > 0) {
      const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id vendorName storeName storeAddress contactNumber');
      
      for (const vendor of vendors) {
        if (vendor.storeAddress) {
          vendorAddresses.push({
            _id: vendor._id,
            vendorName: vendor.vendorName || null,
            storeName: vendor.storeName || null,
            contactNumber: vendor.contactNumber || null,
            storeAddress: {
              line1: vendor.storeAddress.line1 || null,
              line2: vendor.storeAddress.line2 || null,
              pinCode: vendor.storeAddress.pinCode || null,
              city: vendor.storeAddress.city || null,
              state: vendor.storeAddress.state || null,
              latitude: vendor.storeAddress.latitude || null,
              longitude: vendor.storeAddress.longitude || null,
            }
          });
        }
      }
    }

    // Prepare order data for WebSocket using exact database field names
    const orderData = {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items,
      shippingAddress: order.shippingAddress || null,
      pricing: order.pricing || null,
      deliveryAmount: order.deliveryAmount || null,
      user: userDetails,
      vendorAddresses: vendorAddresses,
      createdAt: order.createdAt,
    };

    // Send WebSocket notifications to riders
    try {
      // Console log: All notification details
      console.log('========================================');
      console.log('📤 NOTIFICATION DETAILS');
      console.log('========================================');
      console.log('Order Information:');
      console.log(`  Order ID: ${orderData._id}`);
      console.log(`  Order Number: ${orderData.orderNumber}`);
      console.log(`  Status: ${orderData.status}`);
      if (orderData.pricing) {
        console.log(`  Amount: ₹${orderData.pricing.total || 0}`);
      }
      console.log(`  Delivery Amount: ₹${orderData.deliveryAmount || 0}`);
      console.log('');
      console.log('Shipping Address:');
      if (orderData.shippingAddress) {
        console.log(`  line1: ${orderData.shippingAddress.line1 || 'N/A'}`);
        console.log(`  line2: ${orderData.shippingAddress.line2 || 'N/A'}`);
        console.log(`  city: ${orderData.shippingAddress.city || 'N/A'}`);
        console.log(`  state: ${orderData.shippingAddress.state || 'N/A'}`);
        console.log(`  pinCode: ${orderData.shippingAddress.pinCode || 'N/A'}`);
        console.log(`  country: ${orderData.shippingAddress.country || 'N/A'}`);
        console.log(`  latitude: ${orderData.shippingAddress.latitude || 'N/A'}`);
        console.log(`  longitude: ${orderData.shippingAddress.longitude || 'N/A'}`);
      } else {
        console.log('  N/A');
      }
      console.log('');
      console.log('User Details:');
      if (orderData.user) {
        console.log(`  userName: ${orderData.user.userName || 'N/A'}`);
        console.log(`  contactNumber: ${orderData.user.contactNumber || 'N/A'}`);
        console.log(`  email: ${orderData.user.email || 'N/A'}`);
        if (orderData.user.address) {
          console.log(`  address:`);
          console.log(`    line1: ${orderData.user.address.line1 || 'N/A'}`);
          console.log(`    line2: ${orderData.user.address.line2 || 'N/A'}`);
          console.log(`    city: ${orderData.user.address.city || 'N/A'}`);
          console.log(`    state: ${orderData.user.address.state || 'N/A'}`);
          console.log(`    pinCode: ${orderData.user.address.pinCode || 'N/A'}`);
          console.log(`    latitude: ${orderData.user.address.latitude || 'N/A'}`);
          console.log(`    longitude: ${orderData.user.address.longitude || 'N/A'}`);
        }
        if (orderData.user.addresses && orderData.user.addresses.length > 0) {
          console.log(`  addresses: ${orderData.user.addresses.length} address(es)`);
        }
      } else {
        console.log('  N/A');
      }
      console.log('');
      console.log('Vendor Addresses:');
      if (orderData.vendorAddresses && orderData.vendorAddresses.length > 0) {
        orderData.vendorAddresses.forEach((vendor, index) => {
          console.log(`  Vendor ${index + 1}:`);
          console.log(`    _id: ${vendor._id || 'N/A'}`);
          console.log(`    vendorName: ${vendor.vendorName || 'N/A'}`);
          console.log(`    storeName: ${vendor.storeName || 'N/A'}`);
          console.log(`    contactNumber: ${vendor.contactNumber || 'N/A'}`);
          if (vendor.storeAddress) {
            console.log(`    storeAddress:`);
            console.log(`      line1: ${vendor.storeAddress.line1 || 'N/A'}`);
            console.log(`      line2: ${vendor.storeAddress.line2 || 'N/A'}`);
            console.log(`      city: ${vendor.storeAddress.city || 'N/A'}`);
            console.log(`      state: ${vendor.storeAddress.state || 'N/A'}`);
            console.log(`      pinCode: ${vendor.storeAddress.pinCode || 'N/A'}`);
            console.log(`      latitude: ${vendor.storeAddress.latitude || 'N/A'}`);
            console.log(`      longitude: ${vendor.storeAddress.longitude || 'N/A'}`);
          }
        });
      } else {
        console.log('  N/A');
      }
      console.log('');
      console.log('Pricing Details:');
      if (orderData.pricing) {
        console.log(`  Subtotal: ₹${orderData.pricing.subtotal || 0}`);
        console.log(`  Discount: ₹${orderData.pricing.discount || 0}`);
        console.log(`  Tax: ₹${orderData.pricing.tax || 0}`);
        console.log(`  Handling Charge: ₹${orderData.pricing.handlingCharge || 0}`);
        console.log(`  Total: ₹${orderData.pricing.total || 0}`);
        console.log(`  Total Cashback: ₹${orderData.pricing.totalCashback || 0}`);
      }
      console.log('');
      console.log(`Total Riders: ${activeRiders.length}`);
      const sentCount = await sendOrderAssignmentRequestToRiders(activeRiders, orderData);
      console.log(`Notifications Sent: ${sentCount}/${activeRiders.length}`);
      console.log('========================================');
      
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
                _id: orderData._id,
                orderNumber: orderData.orderNumber,
                status: orderData.status,
                items: orderData.items,
                shippingAddress: orderData.shippingAddress,
                pricing: orderData.pricing,
                deliveryAmount: orderData.deliveryAmount,
                user: orderData.user || null,
                vendorAddresses: orderData.vendorAddresses || [],
                createdAt: orderData.createdAt,
                type: 'rider',
                order: orderData,
              },
            });
          }
        }
      }
    } catch (socketError) {
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
                _id: orderData._id,
                orderNumber: orderData.orderNumber,
                status: orderData.status,
                items: orderData.items,
                shippingAddress: orderData.shippingAddress,
                pricing: orderData.pricing,
                deliveryAmount: orderData.deliveryAmount,
                user: orderData.user || null,
                vendorAddresses: orderData.vendorAddresses || [],
                createdAt: orderData.createdAt,
                type: 'rider',
                order: orderData,
              },
            });
          }
        }
      }
    }

  } catch (error) {
  }
};

/**
 * Update order status (for vendor)
 */
exports.updateOrderStatus = async (orderId, vendorId, status, deliveryAmount) => {
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

  // Store previous status before updating
  const previousStatus = order.status;

  // Update order status
  order.status = status;

  // Update deliveryAmount if provided
  if (deliveryAmount !== undefined) {
    const deliveryAmountNum = parseFloat(deliveryAmount);
    if (isNaN(deliveryAmountNum) || deliveryAmountNum < 0) {
      throw new Error('Delivery amount must be a valid positive number');
    }
    order.deliveryAmount = deliveryAmountNum;
  }

  // Set timestamps based on status
  if (status === 'ready') {
    // Ready for pickup - notify riders
    await exports.notifyRidersForOrder(order);
  } else if (status === 'out_for_delivery') {
    // Out for delivery
  } else if (status === 'delivered') {
    order.deliveredAt = new Date();
    
    // If COD payment, add amount to user wallet
    if (order.payment.method === 'cod' && order.payment.status !== 'completed') {
      try {
        const Wallet = require('../models/Wallet');
        
        // Find or create wallet for user
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user, balance: 0 });
        }
        
        // Add COD payment amount to wallet
        const codAmount = order.payment.amount;
        wallet.balance += codAmount;
        
        // Add transaction record
        wallet.transactions.push({
          type: 'credit',
          amount: codAmount,
          orderId: order._id,
          orderNumber: order.orderNumber,
          description: `COD payment received for order ${order.orderNumber}`,
        });
        
        await wallet.save();
        
        // Update order payment status
        order.payment.status = 'completed';
        order.payment.paidAt = new Date();
        
        logger.info(`COD payment added to wallet for user ${order.user}, order ${order.orderNumber}, amount: ${codAmount}`);
      } catch (walletError) {
        logger.error('Error adding COD payment to wallet:', walletError);
        // Don't fail order status update if wallet update fails
      }
    }
  } else if (status === 'cancelled') {
    order.cancelledAt = new Date();
    order.cancelledBy = 'vendor';
  }

  await order.save();

    // Send push notification to user about order status update
    if (order.user && ['confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
      try {
        const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
        await sendOrderStatusNotification(order.user, {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: status,
        });
      } catch (pushError) {
        logger.error('Error sending push notification for order status update:', pushError);
        // Don't fail the request if push notification fails
      }
    }

    // Send push notification to vendor about order status update
    try {
      const { sendVendorPushNotification } = require('../utils/firebaseNotification');
      
      // Get fresh order data
      const updatedOrder = await Order.findById(order._id)
        .populate('user', 'userName contactNumber email')
        .populate('items.product', 'productName thumbnail')
        .populate('items.vendor', 'storeName storeId')
        .populate('coupon.couponId', 'couponName code')
        .populate('rider', 'fullName mobileNumber');

      // Send notification for important status changes
      if (['ready', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
        const statusMessages = {
          'ready': 'Order is ready for pickup',
          'out_for_delivery': 'Order is out for delivery',
          'delivered': 'Order has been delivered',
          'cancelled': 'Order has been cancelled',
        };

        await sendVendorPushNotification(vendorId, {
          type: 'order_status_updated',
          title: 'Order Status Updated',
          message: `Order #${order.orderNumber} status changed to ${status}. ${statusMessages[status] || ''}`,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status: status,
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: status,
            previousStatus: previousStatus,
          },
        });
      }
  } catch (notifyError) {
    // Don't fail the request if socket notification fails
    logger.error('Error sending socket notification to vendor:', notifyError);
  }

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
  const previousStatus = order.status;
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledBy = 'user';
  order.cancellationReason = reason;
  order.payment.status = order.payment.method === 'cod' ? 'failed' : 'refunded';

  await order.save();

  // Deduct cashback from user account when order is cancelled
  const orderCashback = order.pricing?.totalCashback || 0;
  
  if (orderCashback > 0) {
    try {
      const user = await User.findById(userId);
      if (user) {
        const previousCashback = user.cashback || 0;
        const newCashback = Math.max(0, previousCashback - orderCashback); // Ensure cashback doesn't go negative
        
        user.cashback = newCashback;
        await user.save();
        
        logger.info(`Cashback deducted from user ${userId} for cancelled order ${order.orderNumber}: Previous: ₹${previousCashback}, Deducted: ₹${orderCashback}, New Total: ₹${newCashback}`);
      } else {
        logger.warn(`User ${userId} not found when trying to deduct cashback for cancelled order ${order.orderNumber}`);
      }
    } catch (error) {
      // Don't throw error, just log it - order cancellation should still proceed
      logger.error(`Error deducting cashback from user ${userId} for cancelled order ${order.orderNumber}:`, error);
    }
  }

  // Send push notification to user about order cancellation
  try {
    const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
    await sendOrderStatusNotification(order.user, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: 'cancelled',
    });
  } catch (pushError) {
    logger.error('Error sending push notification for order cancellation:', pushError);
    // Don't fail the request if push notification fails
  }

  // Notify all vendors in the order about cancellation
  try {
    const { sendVendorPushNotification } = require('../utils/firebaseNotification');
    const vendorIds = new Set();
    
    // Get all unique vendor IDs from order items
    order.items.forEach(item => {
      const itemVendorId = item.vendor?._id || item.vendor;
      if (itemVendorId) {
        vendorIds.add(itemVendorId.toString());
      }
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'productName thumbnail')
      .populate('items.vendor', 'storeName storeId')
      .populate('coupon.couponId', 'couponName code');

    // Notify each vendor
    for (const vendorId of vendorIds) {
      try {
        await sendVendorPushNotification(vendorId, {
          type: 'order_cancelled',
          title: 'Order Cancelled',
          message: `Order #${order.orderNumber} has been cancelled by the customer. Reason: ${reason || 'No reason provided'}`,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status: 'cancelled',
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: 'cancelled',
            cancellationReason: reason,
            cancelledBy: 'user',
          },
        });
      } catch (vendorNotifyError) {
        logger.error(`Error sending notification to vendor ${vendorId}:`, vendorNotifyError);
      }
    }
  } catch (notifyError) {
    // Don't fail the request if socket notification fails
    logger.error('Error sending socket notifications for order cancellation:', notifyError);
  }

  return await Order.findById(order._id)
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code');
};

/**
 * Add items to existing order (vendor only)
 * Only allowed if order status is NOT "ready"
 */
exports.addItemsToOrder = async (orderId, vendorId, items) => {
  const order = await Order.findById(orderId)
    .populate('items.product', 'productName thumbnail images')
    .populate('items.vendor', 'storeName storeId');

  if (!order) {
    throw new Error('Order not found');
  }

  // Check if order status is NOT "ready"
  if (order.status === 'ready') {
    throw new Error('Cannot add items to order. Order status is already "ready"');
  }

  // Check if order has items from this vendor
  const vendorItems = order.items.filter(item => {
    const itemVendorId = item.vendor?._id || item.vendor;
    return itemVendorId && itemVendorId.toString() === vendorId.toString();
  });

  if (vendorItems.length === 0) {
    throw new Error('Order does not belong to this vendor');
  }

  // Validate and process new items
  const newOrderItems = [];
  let newSubtotal = 0;
  let newCashback = 0;
  const productImagesMap = new Map();
  const itemsForRevenueTracking = []; // Track items for revenue update

  for (const itemData of items) {
    const { productId, quantity, sku } = itemData;

    if (!productId || !quantity || quantity <= 0) {
      throw new Error('Invalid item data. Product ID and quantity are required');
    }

    const product = await Product.findById(productId)
      .populate('vendor', 'storeName storeId isActive');

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Verify product belongs to the vendor
    const productVendorId = product.vendor?._id || product.vendor;
    if (!productVendorId || productVendorId.toString() !== vendorId.toString()) {
      throw new Error(`Product ${product.productName} does not belong to this vendor`);
    }

    // Validate product availability
    const validation = validateProductAvailability(product);
    if (!validation.available) {
      throw new Error(`${validation.reason} for product ${product.productName}`);
    }

    // Check if product already exists in order (same productId and SKU)
    const existingItemIndex = order.items.findIndex(item => {
      const itemProductId = item.product?._id || item.product;
      const itemSku = item.sku || '';
      const newSku = sku || '';
      return itemProductId && itemProductId.toString() === productId.toString() && 
             itemSku === newSku;
    });

    // Check inventory
    let availableInventory = product.inventory;
    if (product.skus && product.skus.length > 0) {
      if (sku) {
        const skuItem = product.skus.find(s => s.sku === sku);
        if (!skuItem) {
          throw new Error(`Invalid SKU ${sku} for product ${product.productName}`);
        }
        availableInventory = skuItem.inventory;
      } else {
        throw new Error(`SKU is required for product ${product.productName}`);
      }
    }

    if (availableInventory < quantity) {
      throw new Error(`Insufficient inventory for product ${product.productName}. Only ${availableInventory} items available`);
    }

    // Calculate pricing
    const now = new Date();
    let unitPrice;
    let isOfferActive = false;
    
    if (product.offerEnabled && product.offerDiscountPercentage > 0) {
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
      unitPrice = product.salePrice || product.regularPrice || product.actualPrice;
    }

    const salePrice = unitPrice;
    const itemCashbackPerUnit = product.cashback || 0;

    // If product already exists in order, update quantity instead of creating new item
    if (existingItemIndex !== -1) {
      const existingItem = order.items[existingItemIndex];
      const oldTotalPrice = existingItem.totalPrice || 0;
      const oldCashback = existingItem.cashback || 0;
      
      const newQuantity = existingItem.quantity + quantity;
      const newTotalPrice = unitPrice * newQuantity;
      const newItemCashback = itemCashbackPerUnit * newQuantity;

      // Update existing item
      existingItem.quantity = newQuantity;
      existingItem.unitPrice = unitPrice;
      existingItem.salePrice = salePrice;
      existingItem.totalPrice = newTotalPrice;
      existingItem.cashback = newItemCashback;

      // Calculate the difference in subtotal and cashback
      const revenueDifference = newTotalPrice - oldTotalPrice;
      newSubtotal += revenueDifference;
      newCashback += (newItemCashback - oldCashback);
      
      // Track revenue for the incremental quantity added
      if (revenueDifference > 0) {
        itemsForRevenueTracking.push({
          product: productId,
          vendor: vendorId,
          productName: product.productName,
          quantity: quantity, // Only the newly added quantity
          totalPrice: revenueDifference, // Revenue difference
          sku: sku || undefined,
        });
      }
    } else {
      // Create new order item
      const totalPrice = unitPrice * quantity;
      const itemCashback = itemCashbackPerUnit * quantity;

      newSubtotal += totalPrice;
      newCashback += itemCashback;

      // Get product images
      if (product.images && product.images.length > 0) {
        const firstImage = product.images[0];
        productImagesMap.set(productId.toString(), {
          url: firstImage.url,
          publicId: firstImage.publicId,
          mediaType: firstImage.mediaType || 'image',
        });
      } else if (product.thumbnail && product.thumbnail.url) {
        productImagesMap.set(productId.toString(), {
          url: product.thumbnail.url,
          publicId: product.thumbnail.publicId,
          mediaType: 'image',
        });
      }

      // Get thumbnail
      let thumbnail = undefined;
      if (product.thumbnail && product.thumbnail.url) {
        thumbnail = {
          url: product.thumbnail.url,
          publicId: product.thumbnail.publicId || undefined,
        };
      } else if (product.images && product.images.length > 0 && product.images[0].url) {
        thumbnail = {
          url: product.images[0].url,
          publicId: product.images[0].publicId || undefined,
        };
      }

      // Create order item
      const orderItem = {
        product: productId,
        vendor: vendorId,
        productName: product.productName,
        thumbnail: thumbnail,
        quantity: quantity,
        unitPrice: unitPrice,
        salePrice: salePrice,
        totalPrice: totalPrice,
        cashback: itemCashback,
        sku: sku || undefined,
      };

      // Add image if available
      const productImage = productImagesMap.get(productId.toString());
      if (productImage) {
        orderItem.image = {
          url: productImage.url,
          publicId: productImage.publicId || undefined,
          mediaType: productImage.mediaType || 'image',
        };
      }

      newOrderItems.push(orderItem);
      
      // Track revenue for new item
      itemsForRevenueTracking.push({
        product: productId,
        vendor: vendorId,
        productName: product.productName,
        quantity: quantity,
        totalPrice: totalPrice,
        sku: sku || undefined,
      });
    }

    // Update inventory
    if (product.skus && product.skus.length > 0 && sku) {
      const skuItem = product.skus.find(s => s.sku === sku);
      if (skuItem) {
        skuItem.inventory -= quantity;
      }
    } else {
      product.inventory -= quantity;
    }

    await product.save();
  }

  // Add new items to order (only items that don't already exist)
  if (newOrderItems.length > 0) {
    order.items.push(...newOrderItems);
  }

  // Recalculate order pricing
  const allItemsSubtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const allItemsCashback = order.items.reduce((sum, item) => sum + (item.cashback || 0), 0);

  // Apply coupon discount if exists
  let discount = order.pricing.discount || 0;
  if (order.coupon && order.coupon.couponId) {
    const coupon = await Coupon.findById(order.coupon.couponId);
    if (coupon && coupon.isValid()) {
      const discountResult = coupon.calculateDiscount(allItemsSubtotal);
      if (discountResult.valid) {
        discount = discountResult.discount;
      }
    }
  }

  // Calculate handling charge based on vendor's handling charge percentage
  const vendorIds = [...new Set(order.items.map(item => {
    const vendorId = item.vendor?._id || item.vendor;
    return vendorId?.toString();
  }).filter(Boolean))];

  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id handlingChargePercentage');
  const vendorHandlingChargeMap = new Map();
  vendors.forEach(vendor => {
    vendorHandlingChargeMap.set(vendor._id.toString(), vendor.handlingChargePercentage || 0);
  });

  // Group items by vendor and calculate handling charge
  const vendorItemsMap = new Map();
  order.items.forEach(item => {
    const vendorId = (item.vendor?._id || item.vendor)?.toString();
    if (vendorId) {
      if (!vendorItemsMap.has(vendorId)) {
        vendorItemsMap.set(vendorId, []);
      }
      vendorItemsMap.get(vendorId).push(item);
    }
  });

  let totalHandlingCharge = 0;
  vendorItemsMap.forEach((items, vendorId) => {
    const handlingChargePercentage = vendorHandlingChargeMap.get(vendorId) || 0;
    if (handlingChargePercentage > 0) {
      const vendorItemsSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const vendorHandlingCharge = (vendorItemsSubtotal * handlingChargePercentage) / 100;
      totalHandlingCharge += vendorHandlingCharge;
    }
  });

  // Recalculate tax
  const tax = (allItemsSubtotal - discount) * 0.05;
  const total = allItemsSubtotal - discount + tax + totalHandlingCharge;

  // Update order pricing
  order.pricing = {
    subtotal: parseFloat(allItemsSubtotal.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    handlingCharge: parseFloat(totalHandlingCharge.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    totalCashback: parseFloat(allItemsCashback.toFixed(2)),
  };

  // Update payment amount
  order.payment.amount = parseFloat(total.toFixed(2));

  await order.save();

  // Add cashback to user account (ecashback) when items are added to order
  if (newCashback > 0) {
    try {
      const user = await User.findById(order.user);
      if (user) {
        const previousCashback = user.cashback || 0;
        const newCashbackTotal = previousCashback + newCashback;
        user.cashback = newCashbackTotal;
        await user.save();
        
        logger.info(`Cashback added to user ${order.user} for items added to order ${order.orderNumber}: Previous: ₹${previousCashback}, Added: ₹${newCashback}, New Total: ₹${newCashbackTotal}`);
      } else {
        logger.warn(`User ${order.user} not found when trying to add cashback for items added to order ${order.orderNumber}`);
      }
    } catch (error) {
      logger.error(`Error adding cashback to user ${order.user} for items added to order ${order.orderNumber}:`, error);
    }
  }

  // Update vendor revenue tracking for newly added/updated items
  if (itemsForRevenueTracking.length > 0) {
    // Convert to format expected by updateVendorRevenue
    const itemsToTrack = itemsForRevenueTracking.map(item => ({
      product: item.product,
      vendor: item.vendor,
      productName: item.productName,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      sku: item.sku,
    }));
    
    await updateVendorRevenue(order, itemsToTrack);
  }

  // Notify vendor about items added to order
  try {
    const { sendVendorPushNotification } = require('../utils/firebaseNotification');
    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail')
      .populate('items.vendor', 'storeName storeId')
      .populate('coupon.couponId', 'couponName code offerType')
      .populate('rider', 'fullName mobileNumber');

    // Send push notification
    const itemCount = items.length;
    await sendVendorPushNotification(vendorId, {
      type: 'order_items_added',
      title: 'Items Added to Order',
      message: `${itemCount} item(s) added to order #${order.orderNumber}. New total: ₹${order.pricing?.total?.toFixed(2) || 0}`,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      data: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        itemsAdded: itemCount,
        newTotal: order.pricing?.total || 0,
        status: order.status,
      },
    });
  } catch (notifyError) {
    // Don't fail the request if socket notification fails
    logger.error('Error sending socket notification to vendor for items added:', notifyError);
  }

  return await Order.findById(order._id)
    .populate('user', 'userName contactNumber email')
    .populate('items.product', 'productName thumbnail')
    .populate('items.vendor', 'storeName storeId')
    .populate('coupon.couponId', 'couponName code offerType')
    .populate('rider', 'fullName mobileNumber');
};







