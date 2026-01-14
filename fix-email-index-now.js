
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

    // Step 1: Drop problematic unique indexes
    console.log('\nStep 1: Dropping problematic unique indexes...');
    
    // Drop email_1 index
    try {
      await usersCollection.dropIndex('email_1');
      console.log('✓ Successfully dropped email_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('✓ Email index does not exist (already fixed)');
      } else {
        console.log('⚠ Error dropping email index:', error.message);
      }
    }
    
    // Drop phone_1 index
    try {
      await usersCollection.dropIndex('phone_1');
      console.log('✓ Successfully dropped phone_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('✓ Phone index does not exist (already fixed)');
      } else {
        console.log('⚠ Error dropping phone index:', error.message);
      }
    }

    // Step 2: Remove null values from existing documents (optional cleanup)
    console.log('\nStep 2: Cleaning up null values...');
    
    // Clean up null email values
    const emailUpdateResult = await usersCollection.updateMany(
      { email: null },
      { $unset: { email: '' } }
    );
    console.log(`✓ Updated ${emailUpdateResult.modifiedCount} documents with null email`);
    
    // Clean up null phone values
    const phoneUpdateResult = await usersCollection.updateMany(
      { phone: null },
      { $unset: { phone: '' } }
    );
    console.log(`✓ Updated ${phoneUpdateResult.modifiedCount} documents with null phone`);

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

