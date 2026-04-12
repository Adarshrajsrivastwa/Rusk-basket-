const Product = require('../models/Product');

/**
 * Vendor with the highest count of approved + active products (tie-break: ObjectId asc).
 */
async function getVendorWithMostApprovedActiveProducts() {
  const rows = await Product.aggregate([
    {
      $match: {
        approvalStatus: 'approved',
        isActive: true,
        vendor: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: '$vendor', productCount: { $sum: 1 } } },
    { $sort: { productCount: -1, _id: 1 } },
    { $limit: 1 },
  ]);
  if (!rows.length) return null;
  return { vendorId: rows[0]._id, productCount: rows[0].productCount };
}

module.exports = { getVendorWithMostApprovedActiveProducts };
