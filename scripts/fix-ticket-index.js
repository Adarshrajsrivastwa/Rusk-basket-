/**
 * Script to fix ticketNumber index issue
 * Run this once to drop the old index and create the new one
 * 
 * Usage: node scripts/fix-ticket-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function fixTicketIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rushbasket';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');

    // Get all indexes
    const indexes = await ticketsCollection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));

    // Drop the old ticketNumber_1 index if it exists
    try {
      await ticketsCollection.dropIndex('ticketNumber_1');
      console.log('✅ Dropped old ticketNumber_1 index');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('ℹ️  Old ticketNumber_1 index does not exist (already removed)');
      } else {
        console.error('❌ Error dropping index:', error.message);
      }
    }

    // The new index will be created automatically by Mongoose when the model is loaded
    console.log('✅ Index fix completed. The new sparse unique index will be created automatically.');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing ticket index:', error);
    process.exit(1);
  }
}

fixTicketIndex();
