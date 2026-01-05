const Rider = require('../models/Rider');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');
const logger = require('../utils/logger');

const uploadRiderDocumentFiles = async (files) => {
  const uploadPromises = [];

  // Profile photo
  const profileFile = files.profile || files['profile '] || files[' profile'];
  if (profileFile && profileFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(profileFile[0], 'rush-basket/rider-documents/profile').then(
        (result) => ({ field: 'profile', result })
      )
    );
  }

  // Aadhar Card Photo
  const aadharPhotoFile = files.aadharCardPhoto || files['aadharCardPhoto '] || files[' aadharCardPhoto'];
  if (aadharPhotoFile && aadharPhotoFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(aadharPhotoFile[0], 'rush-basket/rider-documents/aadhar').then(
        (result) => ({ field: 'aadharCardPhoto', result })
      )
    );
  }

  // PAN Card Front
  const panFrontFile = files.panCardFront || files['panCardFront '] || files[' panCardFront'];
  if (panFrontFile && panFrontFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(panFrontFile[0], 'rush-basket/rider-documents/pan').then(
        (result) => ({ field: 'panCardFront', result })
      )
    );
  }

  // PAN Card Back
  const panBackFile = files.panCardBack || files['panCardBack '] || files[' panCardBack'];
  if (panBackFile && panBackFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(panBackFile[0], 'rush-basket/rider-documents/pan').then(
        (result) => ({ field: 'panCardBack', result })
      )
    );
  }

  // Driving License Front
  const licenseFrontFile = files.drivingLicenseFront || files['drivingLicenseFront '] || files[' drivingLicenseFront'];
  if (licenseFrontFile && licenseFrontFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(licenseFrontFile[0], 'rush-basket/rider-documents/license').then(
        (result) => ({ field: 'drivingLicenseFront', result })
      )
    );
  }

  // Driving License Back
  const licenseBackFile = files.drivingLicenseBack || files['drivingLicenseBack '] || files[' drivingLicenseBack'];
  if (licenseBackFile && licenseBackFile[0]) {
    uploadPromises.push(
      uploadToCloudinary(licenseBackFile[0], 'rush-basket/rider-documents/license').then(
        (result) => ({ field: 'drivingLicenseBack', result })
      )
    );
  }

  // Cancel Cheque
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
    branchName,
    accountHolderName,
    aadharId,
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

  // Handle Aadhar ID
  if (aadharId !== undefined) {
    rider.documents = rider.documents || {};
    rider.documents.aadharCard = rider.documents.aadharCard || {};
    rider.documents.aadharCard.aadharId = aadharId;
  }

  // Handle bank details
  if (accountNumber !== undefined || ifsc !== undefined || bankName !== undefined || branchName !== undefined || accountHolderName !== undefined) {
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
    if (branchName !== undefined) {
      rider.documents.bankDetails.branchName = branchName;
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

    if (uploadedFiles.aadharCardPhoto) {
      // Delete old aadhar photo if exists
      if (rider.documents?.aadharCard?.photo?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.aadharCard.photo.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old aadhar card photo:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.aadharCard = rider.documents.aadharCard || {};
      rider.documents.aadharCard.photo = uploadedFiles.aadharCardPhoto;
    }

    if (uploadedFiles.panCardFront) {
      // Delete old PAN front if exists
      if (rider.documents?.panCard?.front?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.panCard.front.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old PAN card front:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.panCard = rider.documents.panCard || {};
      rider.documents.panCard.front = uploadedFiles.panCardFront;
    }

    if (uploadedFiles.panCardBack) {
      // Delete old PAN back if exists
      if (rider.documents?.panCard?.back?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.panCard.back.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old PAN card back:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.panCard = rider.documents.panCard || {};
      rider.documents.panCard.back = uploadedFiles.panCardBack;
    }

    if (uploadedFiles.drivingLicenseFront) {
      // Delete old license front if exists
      if (rider.documents?.drivingLicense?.front?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.drivingLicense.front.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old driving license front:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.drivingLicense = rider.documents.drivingLicense || {};
      rider.documents.drivingLicense.front = uploadedFiles.drivingLicenseFront;
    }

    if (uploadedFiles.drivingLicenseBack) {
      // Delete old license back if exists
      if (rider.documents?.drivingLicense?.back?.publicId) {
        try {
          await deleteFromCloudinary(rider.documents.drivingLicense.back.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old driving license back:', deleteError);
        }
      }
      rider.documents = rider.documents || {};
      rider.documents.drivingLicense = rider.documents.drivingLicense || {};
      rider.documents.drivingLicense.back = uploadedFiles.drivingLicenseBack;
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

