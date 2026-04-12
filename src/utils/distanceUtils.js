/**
 * Parse a single coordinate from DB, query string, or number (handles strings / Decimal-like values).
 */
function toNumberCoord(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Many clients send GeoJSON order [lng, lat] as "latitude" / "longitude" by mistake.
 * For South Asia (typical India), longitude is ~64–102°E and latitude ~4–42°N — detect likely swap.
 */
function correctLatLonIfLikelySwappedForSouthAsia(lat, lon) {
  const la = toNumberCoord(lat);
  const lo = toNumberCoord(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    return { latitude: la, longitude: lo, corrected: false };
  }
  const lngLikeInFirst = la >= 64 && la <= 102;
  const latLikeInSecond = lo >= 4 && lo <= 42;
  const latLikeInFirst = la >= 4 && la <= 42;
  const lngLikeInSecond = lo >= 64 && lo <= 102;
  if (lngLikeInFirst && latLikeInSecond && !(latLikeInFirst && lngLikeInSecond)) {
    return { latitude: lo, longitude: la, corrected: true };
  }
  return { latitude: la, longitude: lo, corrected: false };
}

/**
 * Read lat/lon from Express query. Supports latitude/longitude, lat/lng, long, lon.
 * Applies South-Asia swap correction when values look reversed.
 * @returns {{ latitude: number, longitude: number, corrected: boolean } | null}
 */
function parseClientLatLon(query) {
  if (!query || typeof query !== 'object') return null;
  const rawLat = query.latitude ?? query.lat;
  const rawLon = query.longitude ?? query.lng ?? query.long ?? query.lon;
  if (rawLat == null || rawLat === '' || rawLon == null || rawLon === '') {
    return null;
  }
  const { latitude, longitude, corrected } = correctLatLonIfLikelySwappedForSouthAsia(rawLat, rawLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, corrected };
}

/**
 * Haversine distance in kilometers.
 * @returns {number|null} null if any coordinate is missing or invalid
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const a1 = toNumberCoord(lat1);
  const o1 = toNumberCoord(lon1);
  const a2 = toNumberCoord(lat2);
  const o2 = toNumberCoord(lon2);
  if (![a1, o1, a2, o2].every(Number.isFinite)) {
    return null;
  }

  const R = 6371;
  const dLat = toRadians(a2 - a1);
  const dLon = toRadians(o2 - o1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a1)) * Math.cos(toRadians(a2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return parseFloat(distance.toFixed(2));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * @param {Number} distance - kilometers
 * @param {Number} chargePerKm
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
  toNumberCoord,
  parseClientLatLon,
  correctLatLonIfLikelySwappedForSouthAsia,
  calculateDistance,
  calculateDeliveryCharge,
};
