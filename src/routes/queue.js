const express = require('express');
const { getQueueStats } = require('../utils/queue');
const { protect } = require('../middleware/superadminAuth');

const router = express.Router();

router.get('/stats', protect, async (req, res, next) => {
  try {
    const stats = await getQueueStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

