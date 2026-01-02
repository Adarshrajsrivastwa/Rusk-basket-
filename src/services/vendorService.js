const Vendor = require('../models/Vendor');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');
const logger = require('../utils/logger');

const uploadVendorFiles = async (files) => {
  const uploadPromises = [];

  const storeImages = files.storeImage || files['storeImage[]'] || [];
  if (storeImages.length > 0) {
    storeImages.forEach((file) => {
      uploadPromises.push(
        uploadToCloudinary(file, 'rush-basket/store-images').then(
          (result) => ({ field: 'storeImage', result })
        )
      );
    });
  }

  const panFile = files.panImage || files.panCard || files['panCard '] || files[' panCard'];
  if (panFile && panFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(panFile[0], 'rush-basket/documents/pan').then(
        (result) => ({ field: 'panImage', result })
      )
    );
  }

  const aadhaarFile = files.aadhaarImage || files.aadharImage || files.aadharCard || files['aadharCard '] || files[' aadharCard'] || files.aadhaarCard;
  if (aadhaarFile && aadhaarFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(aadhaarFile[0], 'rush-basket/documents/aadhar').then(
        (result) => ({ field: 'aadhaarImage', result })
      )
    );
  }

  const cancelChequeFile = files.cancelCheque || files['cancelCheque '] || files[' cancelCheque'];
  if (cancelChequeFile && cancelChequeFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(cancelChequeFile[0], 'rush-basket/documents/bank').then(
        (result) => ({ field: 'cancelCheque', result })
      )
    );
  }

  const uploadResults = await Promise.all(uploadPromises);
  const uploadedFiles = {};
  uploadResults.forEach(({ field, result }) => {
    if (field === 'storeImage') {
      if (!uploadedFiles.storeImage) {
        uploadedFiles.storeImage = [];
      }
      uploadedFiles.storeImage.push(result);
    } else {
      uploadedFiles[field] = result;
    }
  });

  return uploadedFiles;
};

const updateVendorPermissions = (vendor, permissions) => {
  if (!permissions) return;

  try {
    const permissionsObj = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
    if (permissionsObj.canManageProducts !== undefined) {
      vendor.permissions.canManageProducts = permissionsObj.canManageProducts;
    }
    if (permissionsObj.canManageOrders !== undefined) {
      vendor.permissions.canManageOrders = permissionsObj.canManageOrders;
    }
    if (permissionsObj.canManageInventory !== undefined) {
      vendor.permissions.canManageInventory = permissionsObj.canManageInventory;
    }
    if (permissionsObj.canViewAnalytics !== undefined) {
      vendor.permissions.canViewAnalytics = permissionsObj.canViewAnalytics;
    }
    if (permissionsObj.canManageDiscounts !== undefined) {
      vendor.permissions.canManageDiscounts = permissionsObj.canManageDiscounts;
    }
    if (permissionsObj.canManagePromotions !== undefined) {
      vendor.permissions.canManagePromotions = permissionsObj.canManagePromotions;
    }
    if (permissionsObj.canExportData !== undefined) {
      vendor.permissions.canExportData = permissionsObj.canExportData;
    }
    if (permissionsObj.canManageReviews !== undefined) {
      vendor.permissions.canManageReviews = permissionsObj.canManageReviews;
    }
  } catch (parseError) {
    logger.error('Error parsing permissions:', parseError);
    throw new Error('Invalid permissions format');
  }
};

const createVendorData = async (vendor, data, files, superadminId) => {
  const {
    vendorName,
    altContactNumber,
    email,
    gender,
    dateOfBirth,
    storeName,
    storeAddressLine1,
    storeAddressLine2,
    pinCode,
    latitude,
    longitude,
    ifsc,
    accountNumber,
    bankName,
    bank_name,
    permissions,
  } = data;

  const finalBankName = (bankName || bank_name || '').trim();

  if (!finalBankName) {
    throw new Error('Bank name is required');
  }

  const postOfficeData = await getPostOfficeDetails(pinCode);
  if (!postOfficeData.success) {
    throw new Error(postOfficeData.error || 'Invalid PIN code');
  }

  const storeId = await Vendor.generateStoreId();
  const uploadedFiles = await uploadVendorFiles(files);

  vendor.vendorName = vendorName;
  vendor.altContactNumber = altContactNumber;
  vendor.email = email;
  vendor.gender = gender;
  vendor.dateOfBirth = dateOfBirth;
  vendor.storeId = storeId;
  vendor.storeName = storeName;
  vendor.storeAddress = {
    line1: storeAddressLine1,
    line2: storeAddressLine2,
    pinCode: pinCode,
    city: postOfficeData.city,
    state: postOfficeData.state,
    latitude: latitude ? parseFloat(latitude) : undefined,
    longitude: longitude ? parseFloat(longitude) : undefined,
  };

  vendor.bankDetails = {
    ifsc: ifsc.toUpperCase(),
    accountNumber: accountNumber,
    bankName: finalBankName,
  };
  vendor.createdBy = superadminId;
  vendor.serviceRadius = 5; // Default service radius of 5 km

  updateVendorPermissions(vendor, permissions);

  if (uploadedFiles.storeImage) {
    vendor.storeImage = uploadedFiles.storeImage;
  }

  if (uploadedFiles.panImage) {
    vendor.documents = vendor.documents || {};
    vendor.documents.panCard = uploadedFiles.panImage;
  }

  if (uploadedFiles.aadhaarImage) {
    vendor.documents = vendor.documents || {};
    vendor.documents.aadharCard = uploadedFiles.aadhaarImage;
  }

  if (uploadedFiles.cancelCheque) {
    vendor.bankDetails.cancelCheque = uploadedFiles.cancelCheque;
  }

  return vendor;
};

const updateVendorData = async (vendor, data, files) => {
  const {
    vendorName,
    altContactNumber,
    email,
    gender,
    dateOfBirth,
    storeName,
    storeAddressLine1,
    storeAddressLine2,
    pinCode,
    latitude,
    longitude,
    ifsc,
    accountNumber,
    bankName,
    bank_name,
    permissions,
  } = data;

  if (vendorName !== undefined) {
    vendor.vendorName = vendorName;
  }
  if (altContactNumber !== undefined) {
    vendor.altContactNumber = altContactNumber;
  }
  if (email !== undefined) {
    vendor.email = email;
  }
  if (gender !== undefined) {
    vendor.gender = gender;
  }
  if (dateOfBirth !== undefined) {
    vendor.dateOfBirth = dateOfBirth;
  }
  if (storeName !== undefined) {
    vendor.storeName = storeName;
  }

  if (pinCode !== undefined) {
    const postOfficeData = await getPostOfficeDetails(pinCode);
    if (!postOfficeData.success) {
      throw new Error(postOfficeData.error || 'Invalid PIN code');
    }

    vendor.storeAddress = vendor.storeAddress || {};
    vendor.storeAddress.pinCode = pinCode;
    vendor.storeAddress.city = postOfficeData.city;
    vendor.storeAddress.state = postOfficeData.state;
  }

  if (storeAddressLine1 !== undefined) {
    vendor.storeAddress = vendor.storeAddress || {};
    vendor.storeAddress.line1 = storeAddressLine1;
  }
  if (storeAddressLine2 !== undefined) {
    vendor.storeAddress = vendor.storeAddress || {};
    vendor.storeAddress.line2 = storeAddressLine2;
  }
  if (latitude !== undefined) {
    vendor.storeAddress = vendor.storeAddress || {};
    vendor.storeAddress.latitude = latitude ? parseFloat(latitude) : undefined;
  }
  if (longitude !== undefined) {
    vendor.storeAddress = vendor.storeAddress || {};
    vendor.storeAddress.longitude = longitude ? parseFloat(longitude) : undefined;
  }

  if (ifsc !== undefined || accountNumber !== undefined || bankName !== undefined || bank_name !== undefined) {
    vendor.bankDetails = vendor.bankDetails || {};
    if (ifsc !== undefined) {
      vendor.bankDetails.ifsc = ifsc.toUpperCase();
    }
    if (accountNumber !== undefined) {
      vendor.bankDetails.accountNumber = accountNumber;
    }
    if (bankName !== undefined || bank_name !== undefined) {
      const finalBankName = (bankName || bank_name || '').trim();
      if (finalBankName) {
        vendor.bankDetails.bankName = finalBankName;
      }
    }
  }

  if (permissions !== undefined) {
    updateVendorPermissions(vendor, permissions);
  }

  if (files) {
    const uploadedFiles = await uploadVendorFiles(files);

    if (uploadedFiles.storeImage && uploadedFiles.storeImage.length > 0) {
      if (vendor.storeImage && vendor.storeImage.length > 0) {
        vendor.storeImage = [...vendor.storeImage, ...uploadedFiles.storeImage];
      } else {
        vendor.storeImage = uploadedFiles.storeImage;
      }
    }

    if (uploadedFiles.panImage) {
      vendor.documents = vendor.documents || {};
      vendor.documents.panCard = uploadedFiles.panImage;
    }

    if (uploadedFiles.aadhaarImage) {
      vendor.documents = vendor.documents || {};
      vendor.documents.aadharCard = uploadedFiles.aadhaarImage;
    }

    if (uploadedFiles.cancelCheque) {
      vendor.bankDetails = vendor.bankDetails || {};
      vendor.bankDetails.cancelCheque = uploadedFiles.cancelCheque;
    }
  }

  return vendor;
};

module.exports = {
  uploadVendorFiles,
  updateVendorPermissions,
  createVendorData,
  updateVendorData,
};

