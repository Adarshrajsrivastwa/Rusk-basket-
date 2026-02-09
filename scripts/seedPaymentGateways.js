/**
 * Seed script to initialize payment gateways in the database
 * Run this script once to create default payment gateway entries
 * 
 * Usage: node scripts/seedPaymentGateways.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PaymentGateway = require('../src/models/PaymentGateway');

const paymentGateways = [
  {
    name: 'razorpay',
    displayName: 'Razorpay',
    isEnabled: false,
    priority: 1,
    description: 'Razorpay payment gateway integration',
    credentials: {
      razorpayKeyId: '',
      razorpayKeySecret: '',
    },
    testMode: true,
    testCredentials: {
      razorpayKeyId: '',
      razorpayKeySecret: '',
    },
  },
  {
    name: 'phonepay',
    displayName: 'PhonePe',
    isEnabled: false,
    priority: 2,
    description: 'PhonePe payment gateway integration',
    credentials: {
      phonepayMerchantId: '',
      phonepaySaltKey: '',
      phonepaySaltIndex: '1',
      phonepayAppId: '',
    },
    testMode: true,
    testCredentials: {
      phonepayMerchantId: '',
      phonepaySaltKey: '',
      phonepaySaltIndex: '1',
      phonepayAppId: '',
    },
  },
  {
    name: 'shopify',
    displayName: 'Shopify',
    isEnabled: false,
    priority: 3,
    description: 'Shopify payment gateway integration',
    credentials: {
      shopifyStoreUrl: '',
      shopifyApiKey: '',
      shopifyApiSecret: '',
      shopifyAccessToken: '',
    },
    testMode: true,
    testCredentials: {
      shopifyStoreUrl: '',
      shopifyApiKey: '',
      shopifyApiSecret: '',
      shopifyAccessToken: '',
    },
  },
];

async function seedPaymentGateways() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rushbasket';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing payment gateways (optional - comment out if you want to keep existing)
    // await PaymentGateway.deleteMany({});
    // console.log('Cleared existing payment gateways');

    // Insert payment gateways
    for (const gatewayData of paymentGateways) {
      const existingGateway = await PaymentGateway.findOne({ name: gatewayData.name });
      
      if (existingGateway) {
        console.log(`Payment gateway '${gatewayData.name}' already exists. Skipping...`);
      } else {
        const gateway = new PaymentGateway(gatewayData);
        await gateway.save();
        console.log(`✓ Created payment gateway: ${gatewayData.displayName}`);
      }
    }

    console.log('\n✓ Payment gateways seeded successfully!');
    console.log('\nNote: Please configure the credentials through the admin panel.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding payment gateways:', error);
    process.exit(1);
  }
}

seedPaymentGateways();
