/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Number} lat1 - Latitude of first point
 * @param {Number} lon1 - Longitude of first point
 * @param {Number} lat2 - Latitude of second point
 * @param {Number} lon2 - Longitude of second point
 * @returns {Number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  // Check if coordinates are valid
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  // Convert to radians
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers

  return parseFloat(distance.toFixed(2));
}

/**
 * Convert degrees to radians
 * @param {Number} degrees
 * @returns {Number} Radians
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate delivery charge based on distance and charge per km
 * @param {Number} distance - Distance in kilometers
 * @param {Number} chargePerKm - Charge per kilometer
 * @returns {Number} Total delivery charge
 */
function calculateDeliveryCharge(distance, chargePerKm) {
  if (distance == null || isNaN(distance) || distance < 0) {
    return 0;
  }
  if (chargePerKm == null || isNaN(chargePerKm) || chargePerKm < 0) {
    return 0;
  }
  return parseFloat((distance * chargePerKm).toFixed(2));
}

module.exports = {
  calculateDistance,
  calculateDeliveryCharge,
};
