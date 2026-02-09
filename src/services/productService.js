const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const { uploadToCloudinary } = require('../utils/cloudinary');

const validateCategoryAndSubCategory = async (categoryId, subCategoryId) => {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }
  if (!category.isActive) {
    throw new Error('Category is not active');
  }

  const subCategory = await SubCategory.findById(subCategoryId);
  if (!subCategory) {
    throw new Error('Sub category not found');
  }
  if (subCategory.category.toString() !== categoryId) {
    throw new Error('Sub category does not belong to the selected category');
  }
  if (!subCategory.isActive) {
    throw new Error('Sub category is not active');
  }

  return { category, subCategory };
};

const uploadProductThumbnail = async (files) => {
  if (files && files.thumbnail) {
    const result = await uploadToCloudinary(files.thumbnail, 'rush-basket/products/thumbnails');
    return result;
  }
  return null;
};

const uploadProductImages = async (files) => {
  const images = [];
  if (files && files.images && files.images.length > 0) {
    for (const file of files.images) {
      const result = await uploadToCloudinary(file, 'rush-basket/products/images');
      // Determine media type based on file mimetype
      const mediaType = file.mimetype && file.mimetype.startsWith('video/') ? 'video' : 'image';
      images.push({
        url: result.url,
        publicId: result.publicId,
        mediaType: mediaType,
      });
    }
  }
  return images;
};

const parseSKUs = (skus) => {
  if (!skus) return [];
  try {
    const parsed = typeof skus === 'string' ? JSON.parse(skus) : skus;
    if (!Array.isArray(parsed)) {
      throw new Error('SKUs must be an array');
    }
    return parsed;
  } catch (error) {
    throw new Error('Invalid SKUs format. Must be a valid JSON array');
  }
};

const parseTags = (tags) => {
  if (!tags) return [];
  
  try {
    // If it's already an array, use it directly
    if (Array.isArray(tags)) {
      return tags.map(tag => String(tag).trim().toLowerCase()).filter(tag => tag.length > 0);
    }
    
    // If it's a string, try to parse it
    if (typeof tags === 'string') {
      // First, try to parse as JSON array
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) {
          return parsed.map(tag => String(tag).trim().toLowerCase()).filter(tag => tag.length > 0);
        }
      } catch (jsonError) {
        // If JSON parsing fails, treat it as comma-separated string
        const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        return tagsArray.map(tag => tag.toLowerCase());
      }
    }
    
    // Handle other types - convert to string first
    if (typeof tags === 'number' || typeof tags === 'boolean') {
      return [String(tags).trim().toLowerCase()].filter(tag => tag.length > 0);
    }
    
    // If it's an object (but not array), try to convert
    if (typeof tags === 'object' && tags !== null) {
      // If it has a toString method, use it
      if (typeof tags.toString === 'function') {
        const tagStr = tags.toString();
        if (tagStr !== '[object Object]') {
          return tagStr.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
        }
      }
    }
    
    // If it's not an array or string, convert to string and try to split
    // Always ensure we have a string before calling split
    const tagStr = String(tags);
    if (tagStr && tagStr !== 'undefined' && tagStr !== 'null' && typeof tagStr === 'string') {
      return tagStr.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
    }
    
    return [];
  } catch (error) {
    // If all else fails, return empty array instead of throwing
    // This prevents the tags.split error from crashing the server
    console.error('Error parsing tags:', error, 'Tags value:', tags, 'Type:', typeof tags);
    return [];
  }
};

const updateProductFields = (product, body) => {
  const {
    productName,
    productType,
    productTypeValue,
    productTypeUnit,
    description,
    actualPrice,
    regularPrice,
    salePrice,
    cashback,
    tax,
    latitude,
    longitude,
  } = body;

  if (productName) product.productName = productName;
  if (productType && productTypeValue && productTypeUnit) {
    product.productType = {
      type: productType,
      value: parseFloat(productTypeValue),
      unit: productTypeUnit,
    };
  }
  if (description !== undefined) product.description = description;
  if (actualPrice !== undefined) product.actualPrice = parseFloat(actualPrice);
  if (regularPrice !== undefined) product.regularPrice = parseFloat(regularPrice);
  if (salePrice !== undefined) product.salePrice = salePrice ? parseFloat(salePrice) : null;
  if (cashback !== undefined) product.cashback = parseFloat(cashback);
  if (tax !== undefined) product.tax = parseFloat(tax); // Tax is stored as percentage (0-100)
  if (latitude !== undefined) product.latitude = latitude ? parseFloat(latitude) : undefined;
  if (longitude !== undefined) product.longitude = longitude ? parseFloat(longitude) : undefined;
};

module.exports = {
  validateCategoryAndSubCategory,
  uploadProductThumbnail,
  uploadProductImages,
  parseSKUs,
  parseTags,
  updateProductFields,
};









