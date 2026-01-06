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
  } = data;

  if (userName !== undefined) {
    user.userName = userName;
  }
  if (email !== undefined) {
    user.email = email;
  }
  if (gender !== undefined) {
    user.gender = gender;
  }
  if (dateOfBirth !== undefined) {
    user.dateOfBirth = dateOfBirth;
  }

  // Handle address updates
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



