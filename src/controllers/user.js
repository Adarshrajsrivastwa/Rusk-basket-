const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateUserProfileData } = require('../services/userService');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Find default address from addresses array
    const defaultAddress = user.addresses && user.addresses.length > 0 
      ? user.addresses.find(addr => addr.isDefault === true) || user.addresses[0]
      : null;

    // Format profile response with default address
    const profileData = {
      _id: user._id,
      userName: user.userName,
      email: user.email,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      age: user.age,
      contactNumber: user.contactNumber,
      contactNumberVerified: user.contactNumberVerified,
      profileImage: user.profileImage,
      defaultAddress: defaultAddress ? {
        _id: defaultAddress._id,
        label: defaultAddress.label,
        line1: defaultAddress.line1,
        line2: defaultAddress.line2,
        pinCode: defaultAddress.pinCode,
        city: defaultAddress.city,
        state: defaultAddress.state,
        latitude: defaultAddress.latitude,
        longitude: defaultAddress.longitude,
        isDefault: defaultAddress.isDefault,
      } : null,
      addresses: user.addresses || [],
      cashback: user.cashback,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    logger.error('Get user profile error:', error);
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.contactNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Please verify your contact number first',
      });
    }

    const { email } = req.body;
    // Only check for duplicate email if email is provided and not null/empty
    if (email && email.trim() !== '' && email !== user.email) {
      const existingEmail = await User.findOne({ 
        email: email.trim().toLowerCase(), 
        _id: { $ne: user._id } 
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists',
        });
      }
    }

    await updateUserProfileData(user, req.body, req.file);
    await user.save();

    // Reload user to get updated data
    const updatedUser = await User.findById(req.user._id);
    
    // Find default address from addresses array
    const defaultAddress = updatedUser.addresses && updatedUser.addresses.length > 0 
      ? updatedUser.addresses.find(addr => addr.isDefault === true) || updatedUser.addresses[0]
      : null;

    // Format profile response with default address
    const profileData = {
      _id: updatedUser._id,
      userName: updatedUser.userName,
      email: updatedUser.email,
      dateOfBirth: updatedUser.dateOfBirth,
      gender: updatedUser.gender,
      age: updatedUser.age,
      contactNumber: updatedUser.contactNumber,
      contactNumberVerified: updatedUser.contactNumberVerified,
      profileImage: updatedUser.profileImage,
      defaultAddress: defaultAddress ? {
        _id: defaultAddress._id,
        label: defaultAddress.label,
        line1: defaultAddress.line1,
        line2: defaultAddress.line2,
        pinCode: defaultAddress.pinCode,
        city: defaultAddress.city,
        state: defaultAddress.state,
        latitude: defaultAddress.latitude,
        longitude: defaultAddress.longitude,
        isDefault: defaultAddress.isDefault,
      } : null,
      addresses: updatedUser.addresses || [],
      cashback: updatedUser.cashback,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };

    logger.info(`User profile updated: ${user.contactNumber} (ID: ${user._id})`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: profileData,
    });
  } catch (error) {
    logger.error('Update user profile error:', error);
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.getCashback = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('cashback');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Get cashback directly from user schema
    const cashbackData = {
      cashback: user.cashback || 0,
      currency: 'INR',
    };

    logger.info(`Cashback retrieved for user: ${req.user._id} - Balance: ${cashbackData.cashback}`);

    res.status(200).json({
      success: true,
      data: cashbackData,
    });
  } catch (error) {
    logger.error('Get cashback error:', error);
    next(error);
  }
};

// Address management functions
exports.addAddress = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const { label, line1, line2, pinCode, latitude, longitude, isDefault } = req.body;

    // Validate PIN code and get city/state
    const postOfficeData = await getPostOfficeDetails(pinCode);
    if (!postOfficeData.success) {
      return res.status(400).json({
        success: false,
        error: postOfficeData.error || 'Invalid PIN code',
      });
    }

    // Create new address object
    const newAddress = {
      label: label || 'Home',
      line1: line1.trim(),
      line2: line2 ? line2.trim() : '',
      pinCode: pinCode.trim(),
      city: postOfficeData.city,
      state: postOfficeData.state,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      isDefault: isDefault === true || isDefault === 'true',
      createdAt: new Date(),
    };

    // If this is set as default, unset all other default addresses
    if (newAddress.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    } else if (user.addresses.length === 0) {
      // If this is the first address, make it default
      newAddress.isDefault = true;
    }

    // Add address to user's addresses array
    user.addresses.push(newAddress);
    await user.save();

    logger.info(`Address added for user: ${req.user._id} (Address ID: ${user.addresses[user.addresses.length - 1]._id})`);

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: user.addresses[user.addresses.length - 1],
    });
  } catch (error) {
    logger.error('Add address error:', error);
    next(error);
  }
};

exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user.addresses || [],
    });
  } catch (error) {
    logger.error('Get addresses error:', error);
    next(error);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const { addressId } = req.params;
    const { label, line1, line2, pinCode, latitude, longitude, isDefault } = req.body;

    // Find the address in user's addresses array
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Address not found',
      });
    }

    // If PIN code is being updated, validate it
    let city = address.city;
    let state = address.state;
    if (pinCode && pinCode !== address.pinCode) {
      const postOfficeData = await getPostOfficeDetails(pinCode);
      if (!postOfficeData.success) {
        return res.status(400).json({
          success: false,
          error: postOfficeData.error || 'Invalid PIN code',
        });
      }
      city = postOfficeData.city;
      state = postOfficeData.state;
    }

    // Update address fields
    if (label !== undefined) address.label = label.trim() || 'Home';
    if (line1 !== undefined) address.line1 = line1.trim();
    if (line2 !== undefined) address.line2 = line2 ? line2.trim() : '';
    if (pinCode !== undefined) address.pinCode = pinCode.trim();
    if (city) address.city = city;
    if (state) address.state = state;
    if (latitude !== undefined) address.latitude = latitude ? parseFloat(latitude) : undefined;
    if (longitude !== undefined) address.longitude = longitude ? parseFloat(longitude) : undefined;

    // Handle default address setting
    if (isDefault === true || isDefault === 'true') {
      // Unset all other default addresses
      user.addresses.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
      address.isDefault = true;
    } else if (isDefault === false || isDefault === 'false') {
      address.isDefault = false;
      // If unsetting default and this was the only default, set first address as default
      const hasDefault = user.addresses.some(addr => addr.isDefault && addr._id.toString() !== addressId);
      if (!hasDefault && user.addresses.length > 0) {
        user.addresses[0].isDefault = true;
      }
    }

    await user.save();

    logger.info(`Address updated for user: ${req.user._id} (Address ID: ${addressId})`);

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: address,
    });
  } catch (error) {
    logger.error('Update address error:', error);
    next(error);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const { addressId } = req.params;

    // Find the address in user's addresses array
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Address not found',
      });
    }

    const wasDefault = address.isDefault;

    // Remove the address
    user.addresses.pull(addressId);

    // If deleted address was default and there are other addresses, set first one as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    logger.info(`Address deleted for user: ${req.user._id} (Address ID: ${addressId})`);

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    logger.error('Delete address error:', error);
    next(error);
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const { addressId } = req.params;

    // Find the address in user's addresses array
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        error: 'Address not found',
      });
    }

    // Unset all other default addresses
    user.addresses.forEach(addr => {
      addr.isDefault = addr._id.toString() === addressId;
    });

    await user.save();

    logger.info(`Default address set for user: ${req.user._id} (Address ID: ${addressId})`);

    res.status(200).json({
      success: true,
      message: 'Default address updated successfully',
      data: address,
    });
  } catch (error) {
    logger.error('Set default address error:', error);
    next(error);
  }
};





