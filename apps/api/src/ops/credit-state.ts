export function creditAction(input: { plan: string | undefined; status: string | undefined; balance: number | undefined; expiry: Date | undefined }, now = new Date()) {
  if (input.status !== 'ACTIVE') return 'account_unavailable'
  if (input.plan === 'PAID') return 'paid'
  if (input.balance === undefined || !Number.isFinite(input.balance) || !input.expiry || !Number.isFinite(input.expiry.getTime())) return 'unknown'
  if (input.balance < 20 || input.expiry.getTime() - now.getTime() <= 30 * 86400000) return 'upgrade_required'
  return 'healthy'
}
