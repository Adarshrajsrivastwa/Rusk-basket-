const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');
const logger = require('../utils/logger');

const uploadUserProfileImage = async (file) => {
  if (!file) {
    return null;
  }
  return await uploadToCloudinary(file, 'rush-basket/user-profiles');
};

const updateUserProfileData = async (user, data, file) => {
  const {
    userName,
    email,
    gender,
    dateOfBirth,
    addressLine1,
    addressLine2,
    pinCode,
    latitude,
    longitude,
    // Default address fields
    defaultAddressLine1,
    defaultAddressLine2,
    defaultAddressPinCode,
    defaultAddressLatitude,
    defaultAddressLongitude,
    defaultAddressLabel,
  } = data;

  if (userName !== undefined) {
    user.userName = userName.trim();
  }
  if (email !== undefined) {
    // Email is optional - can be null or a valid email string
    user.email = (email === null || email === '') ? null : email.trim().toLowerCase();
  }
  if (gender !== undefined) {
    user.gender = gender;
  }
  if (dateOfBirth !== undefined) {
    user.dateOfBirth = dateOfBirth;
  }

  // Handle default address updates
  if (defaultAddressLine1 !== undefined || defaultAddressLine2 !== undefined || defaultAddressPinCode !== undefined || 
      defaultAddressLatitude !== undefined || defaultAddressLongitude !== undefined || defaultAddressLabel !== undefined) {
    
    // Find or create default address
    let defaultAddress = user.addresses && user.addresses.length > 0 
      ? user.addresses.find(addr => addr.isDefault === true)
      : null;

    if (!defaultAddress) {
      // If no default address exists, create one
      if (!defaultAddressLine1 || !defaultAddressPinCode) {
        throw new Error('Address line 1 and PIN code are required to create a default address');
      }
      
      const postOfficeData = await getPostOfficeDetails(defaultAddressPinCode);
      if (!postOfficeData.success) {
        throw new Error(postOfficeData.error || 'Invalid PIN code');
      }

      // Unset all other default addresses
      if (user.addresses && user.addresses.length > 0) {
        user.addresses.forEach(addr => {
          addr.isDefault = false;
        });
      }

      defaultAddress = {
        label: defaultAddressLabel || 'Home',
        line1: defaultAddressLine1.trim(),
        line2: defaultAddressLine2 ? defaultAddressLine2.trim() : '',
        pinCode: defaultAddressPinCode.trim(),
        city: postOfficeData.city,
        state: postOfficeData.state,
        latitude: defaultAddressLatitude ? parseFloat(defaultAddressLatitude) : undefined,
        longitude: defaultAddressLongitude ? parseFloat(defaultAddressLongitude) : undefined,
        isDefault: true,
        createdAt: new Date(),
      };
      
      if (!user.addresses) {
        user.addresses = [];
      }
      user.addresses.push(defaultAddress);
    } else {
      // Update existing default address
      if (defaultAddressLine1 !== undefined) {
        defaultAddress.line1 = defaultAddressLine1.trim();
      }
      if (defaultAddressLine2 !== undefined) {
        defaultAddress.line2 = defaultAddressLine2 ? defaultAddressLine2.trim() : '';
      }
      if (defaultAddressLabel !== undefined) {
        defaultAddress.label = defaultAddressLabel.trim() || 'Home';
      }
      
      if (defaultAddressPinCode !== undefined) {
        const postOfficeData = await getPostOfficeDetails(defaultAddressPinCode);
        if (!postOfficeData.success) {
          throw new Error(postOfficeData.error || 'Invalid PIN code');
        }
        defaultAddress.pinCode = defaultAddressPinCode.trim();
        defaultAddress.city = postOfficeData.city;
        defaultAddress.state = postOfficeData.state;
      }
      
      if (defaultAddressLatitude !== undefined) {
        defaultAddress.latitude = defaultAddressLatitude ? parseFloat(defaultAddressLatitude) : undefined;
      }
      if (defaultAddressLongitude !== undefined) {
        defaultAddress.longitude = defaultAddressLongitude ? parseFloat(defaultAddressLongitude) : undefined;
      }
    }
  }

  // Handle legacy address updates (for backward compatibility)
  if (addressLine1 !== undefined || addressLine2 !== undefined || pinCode !== undefined || latitude !== undefined || longitude !== undefined) {
    user.address = user.address || {};
    
    if (addressLine1 !== undefined) {
      user.address.line1 = addressLine1;
    }
    if (addressLine2 !== undefined) {
      user.address.line2 = addressLine2;
    }
    if (pinCode !== undefined) {
      const postOfficeData = await getPostOfficeDetails(pinCode);
      if (!postOfficeData.success) {
        throw new Error(postOfficeData.error || 'Invalid PIN code');
      }
      user.address.pinCode = pinCode;
      user.address.city = postOfficeData.city;
      user.address.state = postOfficeData.state;
    }
    if (latitude !== undefined) {
      user.address.latitude = latitude ? parseFloat(latitude) : undefined;
    }
    if (longitude !== undefined) {
      user.address.longitude = longitude ? parseFloat(longitude) : undefined;
    }
  }

  // Handle profile image upload
  if (file) {
    // Delete old profile image if exists
    if (user.profileImage && user.profileImage.publicId) {
      try {
        await deleteFromCloudinary(user.profileImage.publicId);
      } catch (deleteError) {
        logger.error('Error deleting old profile image:', deleteError);
        // Continue even if deletion fails
      }
    }
    
    const uploadedImage = await uploadUserProfileImage(file);
    if (uploadedImage) {
      user.profileImage = uploadedImage;
    }
  }

  return user;
};

module.exports = {
  uploadUserProfileImage,
  updateUserProfileData,
};





