/**
 * Quick Fix Script - Run this immediately to fix the email index issue
 * 
 * Usage: node fix-email-index-now.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const fixEmailIndex = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Step 1: Drop the unique email index
    console.log('\nStep 1: Dropping email_1 index...');
    try {
      await usersCollection.dropIndex('email_1');
      console.log('✓ Successfully dropped email_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('✓ Email index does not exist (already fixed)');
      } else {
        throw error;
      }
    }

    // Step 2: Remove null email values from existing documents (optional cleanup)
    console.log('\nStep 2: Cleaning up null email values...');
    const updateResult = await usersCollection.updateMany(
      { email: null },
      { $unset: { email: '' } }
    );
    console.log(`✓ Updated ${updateResult.modifiedCount} documents with null email`);

    console.log('\n✅ Fix completed successfully!');
    console.log('You can now restart your application.');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

fixEmailIndex();

