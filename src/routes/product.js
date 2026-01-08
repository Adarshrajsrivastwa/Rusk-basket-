const express = require('express');
const router = express.Router();
const { getAllProducts } = require('../controllers/productGet');
const { protect } = require('../middleware/adminAuth');

// Get all products (Admin only)
router.get('/all', protect, getAllProducts);

module.exports = router;
