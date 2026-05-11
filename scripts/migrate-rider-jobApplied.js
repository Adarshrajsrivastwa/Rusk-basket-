/**
 * One-time migration: rider.jobApplied legacy boolean → string status
 *
 * - true  → 'pending' (earlier code set boolean true on job apply)
 * - false → 'none'
 *
 * Usage:
 *   node scripts/migrate-rider-jobApplied.js
 *
 * Requires MONGODB_URI or MONGO_URI in .env
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/test';
  await mongoose.connect(mongoUri);
  console.log('Connected:', mongoUri.replace(/\/\/.*@/, '//***@'));

  const col = mongoose.connection.collection('riders');

  const rTrue = await col.updateMany({ jobApplied: true }, { $set: { jobApplied: 'pending' } });
  console.log('jobApplied true → pending:', rTrue.modifiedCount);

  const rFalse = await col.updateMany({ jobApplied: false }, { $set: { jobApplied: 'none' } });
  console.log('jobApplied false → none:', rFalse.modifiedCount);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
