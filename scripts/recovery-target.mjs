/** pgBackRest expects a SQL timestamp with an explicit timezone, not ISO T/Z. */
export function recoveryTarget(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(iso) || !Number.isFinite(Date.parse(iso))) throw new Error('Use a valid explicit UTC recovery time.')
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '+00')
}
