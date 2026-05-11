const JOB_APPLIED_VALUES = Object.freeze(['none', 'pending', 'approved', 'rejected']);

/**
 * API-safe jobApplied: legacy DB had boolean true (apply) / false.
 * Unknown values fall back to 'none'.
 */
function normalizeJobApplied(value) {
  if (value === true) return 'pending';
  if (value === false || value == null || value === '') return 'none';
  const s = String(value).trim();
  if (s === 'true') return 'pending';
  if (s === 'false') return 'none';
  if (JOB_APPLIED_VALUES.includes(s)) return s;
  return 'none';
}

module.exports = {
  normalizeJobApplied,
  JOB_APPLIED_VALUES,
};
