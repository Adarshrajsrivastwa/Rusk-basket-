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
    const parsed = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (!Array.isArray(parsed)) {
      throw new Error('Tags must be an array');
    }
    return parsed.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
  } catch (error) {
    throw new Error('Invalid tags format. Must be a valid JSON array');
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
};

module.exports = {
  validateCategoryAndSubCategory,
  uploadProductThumbnail,
  uploadProductImages,
  parseSKUs,
  parseTags,
  updateProductFields,
};





