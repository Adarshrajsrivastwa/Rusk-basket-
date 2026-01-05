const Rider = require('../models/Rider');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');
const logger = require('../utils/logger');

const uploadRiderDocumentFiles = async (files) => {
  const uploadPromises = [];

  const profileFile = files.profile || files['profile '] || files[' profile'];
  if (profileFile && profileFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(profileFile[0], 'rush-basket/rider-documents/profile').then(
        (result) => ({ field: 'profile', result })
      )
    );
  }

  // Aadhar Card - separate field
  const aadharFile = files.aadharCard || files['aadharCard '] || files[' aadharCard'];
  if (aadharFile && aadharFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(aadharFile[0], 'rush-basket/rider-documents/aadhar').then(
        (result) => ({ field: 'aadharCard', result })
      )
    );
  }

  // PAN Card - separate field
  const panFile = files.panCard || files['panCard '] || files[' panCard'];
  if (panFile && panFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(panFile[0], 'rush-basket/rider-documents/pan').then(
        (result) => ({ field: 'panCard', result })
      )
    );
  }

  const licenseFile = files.drivingLicense || files['drivingLicense '] || files[' drivingLicense'];
  if (licenseFile && licenseFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(licenseFile[0], 'rush-basket/rider-documents/license').then(
        (result) => ({ field: 'drivingLicense', result })
      )
    );
  }

  const cancelChequeFile = files.cancelCheque || files['cancelCheque '] || files[' cancelCheque'];
  if (cancelChequeFile && cancelChequeFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(cancelChequeFile[0], 'rush-basket/rider-documents/bank').then(
        (result) => ({ field: 'cancelCheque', result })
      )
    );
  }

  const uploadResults = await Promise.allSettled(uploadPromises);
  const uploadedFiles = {};
  
  uploadResults.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      const { field, result: uploadResult } = result.value;
      uploadedFiles[field] = uploadResult;
    }
  });

  return uploadedFiles;
};

const updateRiderProfileData = async (rider, data, files) => {
  const {
    fullName,
    fathersName,
    mothersName,
    dateOfBirth,
    whatsappNumber,
    bloodGroup,
    city,
    currentAddressLine1,
    currentAddressLine2,
    pinCode,
    latitude,
    longitude,
    language,
    emergencyContactPersonName,
    emergencyContactPersonRelation,
    emergencyContactPersonNumber,
    emergencyContactNumber,
    workDetails,
    accountNumber,
    ifsc,
    bankName,
    accountHolderName,
  } = data;

  if (fullName !== undefined) {
    rider.fullName = fullName;
  }
  if (fathersName !== undefined) {
    rider.fathersName = fathersName;
  }
  if (mothersName !== undefined) {
    rider.mothersName = mothersName;
  }
  if (dateOfBirth !== undefined) {
    rider.dateOfBirth = dateOfBirth;
  }
  if (whatsappNumber !== undefined) {
    rider.whatsappNumber = whatsappNumber;
  }
  if (bloodGroup !== undefined) {
    rider.bloodGroup = bloodGroup;
  }
  if (city !== undefined) {
    rider.city = city;
  }

  // Handle current address updates
  if (currentAddressLine1 !== undefined || currentAddressLine2 !== undefined || pinCode !== undefined || latitude !== undefined || longitude !== undefined) {
    rider.currentAddress = rider.currentAddress || {};
    
    if (currentAddressLine1 !== undefined) {
      rider.currentAddress.line1 = currentAddressLine1;
    }
    if (currentAddressLine2 !== undefined) {
      rider.currentAddress.line2 = currentAddressLine2;
    }
    if (pinCode !== undefined) {
      const postOfficeData = await getPostOfficeDetails(pinCode);
      if (!postOfficeData.success) {
        throw new Error(postOfficeData.error || 'Invalid PIN code');
      }
      rider.currentAddress.pinCode = pinCode;
      rider.currentAddress.city = postOfficeData.city;
      rider.currentAddress.state = postOfficeData.state;
    }
    if (latitude !== undefined) {
      rider.currentAddress.latitude = latitude ? parseFloat(latitude) : undefined;
    }
    if (longitude !== undefined) {
      rider.currentAddress.longitude = longitude ? parseFloat(longitude) : undefined;
    }
  }

  // Handle language
  if (language !== undefined) {
    try {
      const languageArray = typeof language === 'string' ? JSON.parse(language) : language;
      if (Array.isArray(languageArray)) {
        rider.language = languageArray;
      }
    } catch (parseError) {
      logger.error('Error parsing language:', parseError);
      throw new Error('Invalid language format. Must be an array.');
    }
  }

  // Handle emergency contact
  if (emergencyContactPersonName !== undefined || emergencyContactPersonRelation !== undefined || emergencyContactPersonNumber !== undefined) {
    rider.emergencyContactPerson = rider.emergencyContactPerson || {};
    if (emergencyContactPersonName !== undefined) {
      rider.emergencyContactPerson.name = emergencyContactPersonName;
    }
    if (emergencyContactPersonRelation !== undefined) {
      rider.emergencyContactPerson.relation = emergencyContactPersonRelation;
    }
    if (emergencyContactPersonNumber !== undefined) {
      rider.emergencyContactPerson.contactNumber = emergencyContactPersonNumber;
    }
  }
  if (emergencyContactNumber !== undefined) {
    rider.emergencyContactNumber = emergencyContactNumber;
  }

  // Handle work details
  if (workDetails !== undefined) {
    try {
      const workDetailsObj = typeof workDetails === 'string' ? JSON.parse(workDetails) : workDetails;
      if (typeof workDetailsObj === 'object') {
        rider.workDetails = workDetailsObj;
      }
    } catch (parseError) {
      logger.error('Error parsing work details:', parseError);
      throw new Error('Invalid work details format. Must be a valid JSON object.');
    }
  }

  // Handle bank details
  if (accountNumber !== undefined || ifsc !== undefined || bankName !== undefined || accountHolderName !== undefined) {
    rider.documents = rider.documents || {};
    rider.documents.bankDetails = rider.documents.bankDetails || {};
    
    if (accountNumber !== undefined) {
      rider.documents.bankDetails.accountNumber = accountNumber;
    }
    if (ifsc !== undefined) {
      rider.documents.bankDetails.ifsc = ifsc.toUpperCase();
    }
    if (bankName !== undefined) {
      rider.documents.bankDetails.bankName = bankName;
    }
    if (accountHolderName !== undefined) {
      rider.documents.bankDetails.accountHolderName = accountHolderName;
    }
  }

  // Handle document uploads
  if (files) {
    const uploadedFiles = await uploadRiderDocumentFiles(files);

    if (uploadedFiles.profile) {
      // Delete old profile if exists
      if (rider.documents?.profile?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.profile.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old profile:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.profile = uploadedFiles.profile;
    }

    if (uploadedFiles.aadharCard) {
      // Delete old aadhar if exists
      if (rider.documents?.aadharCard?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.aadharCard.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old aadhar card:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.aadharCard = uploadedFiles.aadharCard;
    }

    if (uploadedFiles.panCard) {
      // Delete old PAN if exists
      if (rider.documents?.panCard?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.panCard.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old PAN card:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.panCard = uploadedFiles.panCard;
    }

    if (uploadedFiles.drivingLicense) {
      // Delete old license if exists
      if (rider.documents?.drivingLicense?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.drivingLicense.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old driving license:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.drivingLicense = uploadedFiles.drivingLicense;
    }

    if (uploadedFiles.cancelCheque) {
      // Delete old cancel cheque if exists
      if (rider.documents?.bankDetails?.cancelCheque?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.bankDetails.cancelCheque.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old cancel cheque:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.bankDetails = rider.documents.bankDetails || {};
      rider.documents.bankDetails.cancelCheque = uploadedFiles.cancelCheque;
    }
  }

  return rider;
};

module.exports = {
  uploadRiderDocumentFiles,
  updateRiderProfileData,
};

