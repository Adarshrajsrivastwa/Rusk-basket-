# Environment Variables Setup Guide

## Required Environment Variables

Copy these variables to your `.env` file in the `backend` directory:

```env
# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3000
NODE_ENV=development

# ============================================
# DATABASE CONFIGURATION
# ============================================
MONGODB_URI=mongodb://localhost:27017/rushbasket
# Alternative: MONGO_URI=mongodb://localhost:27017/rushbasket

# ============================================
# JWT AUTHENTICATION
# ============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# ============================================
# CORS CONFIGURATION
# ============================================
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,https://admin.rushbaskets.com,https://grocery.rushbaskets.com

# ============================================
# FIREBASE CLOUD MESSAGING (FCM) - PUSH NOTIFICATIONS
# ============================================
# Firebase Service Account JSON (as a string)
# Get this from Firebase Console > Project Settings > Service Accounts > Generate New Private Key
# Convert the JSON to a single line string and paste here
# IMPORTANT: Replace all newlines with \n and keep it as a single line
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id","private_key_id":"","private_key":"-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----\n","client_email":"","auth_uri":"","token_uri":"","auth_provider_x509_cert_url":"","client_x509_cert_url":""}

# ============================================
# CLOUDINARY - IMAGE/FILE UPLOAD
# ============================================
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# ============================================
# SMS SERVICE (NIMBUS)
# ============================================
NIMBUS_USER_ID=your-nimbus-user-id
NIMBUS_PASSWORD=your-nimbus-password
NIMBUS_SENDER_ID=RUSHBG
NIMBUS_ENTITY_ID=your-nimbus-entity-id
NIMBUS_TEMPLATE_ID=your-nimbus-template-id
NIMBUS_API_URL=http://nimbusit.biz/api/SmsApi/SendSingleApi

# ============================================
# REDIS (OPTIONAL - FOR QUEUE/JOB PROCESSING)
# ============================================
# Redis URL (if using Redis URL format)
# REDIS_URL=redis://localhost:6379
# OR use individual settings:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ============================================
# PAYMENT GATEWAY (RAZORPAY) - OPTIONAL
# ============================================
# RAZORPAY_KEY_ID=your-razorpay-key-id
# RAZORPAY_KEY_SECRET=your-razorpay-key-secret
```

## Setup Instructions

1. **Create `.env` file**: Copy the above variables to a new file named `.env` in the `backend` directory

2. **Replace placeholder values** with your actual credentials:
   - **JWT_SECRET**: Generate a strong random string (use: `openssl rand -base64 32`)
   - **MONGODB_URI**: Your MongoDB connection string
   - **FIREBASE_SERVICE_ACCOUNT**: Download from Firebase Console and convert to single-line JSON string
   - **CLOUDINARY**: Get from Cloudinary Dashboard
   - **NIMBUS**: Get from your SMS service provider

3. **Firebase Setup** (for Push Notifications):
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Download the JSON file
   - Convert it to a single-line string:
     ```bash
     # On Linux/Mac:
     cat firebase-service-account.json | jq -c
     
     # Or manually replace newlines with \n
     ```
   - Paste the result as `FIREBASE_SERVICE_ACCOUNT` value

4. **Important Notes**:
   - Never commit `.env` file to version control
   - Use different values for development and production
   - Keep `JWT_SECRET` secure and never share it
   - For production, use strong, randomly generated secrets

## Required for Push Notifications

For admin/vendor push notifications to work, you **MUST** configure:
- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON (as string)

## Required for Image Uploads

For product/category image uploads to work, you **MUST** configure:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Required for SMS/OTP

For OTP functionality to work, you **MUST** configure:
- `NIMBUS_USER_ID`
- `NIMBUS_PASSWORD`
- `NIMBUS_ENTITY_ID`
- `NIMBUS_TEMPLATE_ID`

## Optional Services

- **Redis**: Only needed if using background job processing
- **Razorpay**: Only needed if using Razorpay payment gateway
