/**
 * MongoDB Migration Script
 * Removes unique constraint from email field in users collection
 * 
 * This script:
 * 1. Drops the unique email index (email_1)
 * 2. Email field is now optional and can be null for multiple users
 * 
 * IMPORTANT: Run this script to fix existing database issues before using the application
 * 
 * Usage:
 * node scripts/fix-email-index.js
 * 
 * Or run directly in MongoDB shell:
 * use test
 * db.users.dropIndex('email_1')
 */

const mongoose = require('mongoose');
require('dotenv').config();

const fixEmailIndex = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Drop existing unique email index if it exists
    console.log('Dropping existing email unique index...');
    try {
      await usersCollection.dropIndex('email_1');
      console.log('Successfully dropped email_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('Email index does not exist, nothing to drop');
      } else {
        console.log('Warning: Error dropping email index:', error.message);
      }
    }

    // Drop existing unique phone index if it exists
    console.log('Dropping existing phone unique index...');
    try {
      await usersCollection.dropIndex('phone_1');
      console.log('Successfully dropped phone_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('Phone index does not exist, nothing to drop');
      } else {
        console.log('Warning: Error dropping phone index:', error.message);
      }
    }

    console.log('Email and phone fields are now optional - multiple users can have null values');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

// Run the migration
fixEmailIndex();

