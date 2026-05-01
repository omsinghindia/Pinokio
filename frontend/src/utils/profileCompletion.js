/**
 * Simple profile completion score (0–100) for the dashboard.
 * Each filled field below counts equally.
 */
const FIELDS = ['full_name', 'age', 'gender', 'city', 'bio', 'interests', 'avatar_url'];

export function profileCompletionPercent (profile) {
  if (!profile) return 0;
  let n = 0;
  for (const key of FIELDS) {
    const v = profile[key];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      n += 1;
    }
  }
  return Math.round((n / FIELDS.length) * 100);
}
