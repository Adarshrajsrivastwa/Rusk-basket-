/**
 * Utility functions for analytics
 */

/**
 * Get date range based on period
 * @param {string} period - 'today', 'week', 'month', 'year', 'all'
 * @returns {Object} { startDate, endDate }
 */
const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    case 'all':
      startDate = new Date(0);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
  }

  return { startDate, endDate: new Date() };
};

module.exports = {
  getDateRange,
};
