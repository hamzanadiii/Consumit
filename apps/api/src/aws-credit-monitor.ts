import { FreeTierClient, GetAccountPlanStateCommand } from '@aws-sdk/client-freetier'
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets'
import { writeFileSync, renameSync } from 'node:fs'
import { readAwsCredentials } from './config/aws-credentials.ts'
import { creditAction } from './ops/credit-state.ts'

const credentials = readAwsCredentials('/run/secrets/credit-aws.json')
const client = new FreeTierClient({ region: 'us-east-1', credentials, maxAttempts: 1 })
const budgets = new BudgetsClient({ region: 'us-east-1', credentials, maxAttempts: 1 })
try {
  const state = await client.send(new GetAccountPlanStateCommand({}), { abortSignal: AbortSignal.timeout(5000) })
  const recordedExpiry = new Date(process.env.AWS_CREDIT_EXPIRES_AT ?? '')
  if (!Number.isFinite(recordedExpiry.getTime())) throw new Error('Actual credit expiry must be recorded from AWS.')
  const expiry = state.accountPlanExpirationDate && state.accountPlanExpirationDate < recordedExpiry ? state.accountPlanExpirationDate : recordedExpiry
  const balance = state.accountPlanRemainingCredits?.unit === 'USD' ? state.accountPlanRemainingCredits.amount : undefined
  const action = creditAction({ plan: state.accountPlanType, status: state.accountPlanStatus, balance, expiry })
  const budget = await budgets.send(new DescribeBudgetCommand({ AccountId: state.accountId, BudgetName: 'consumit-gross-usage-2-usd' }), { abortSignal: AbortSignal.timeout(5000) })
  const gross = Number(budget.Budget?.CalculatedSpend?.ActualSpend?.Amount)
  const lines = [
    `consumit_credit_monitor_timestamp_seconds ${Math.floor(Date.now() / 1000)}`,
    `consumit_credit_upgrade_required ${action === 'upgrade_required' ? 1 : 0}`,
    `consumit_credit_account_unavailable ${['unknown', 'account_unavailable'].includes(action) ? 1 : 0}`,
    `consumit_credit_expiry_timestamp_seconds ${Math.floor(expiry.getTime() / 1000)}`,
  ]
  if (balance !== undefined) lines.push(`consumit_credit_balance_usd ${balance}`)
  if (Number.isFinite(gross)) lines.push(`consumit_aws_gross_usage_usd ${gross}`)
  writeFileSync('/metrics/credit.prom.tmp', lines.join('\n') + '\n', { mode: 0o644 })
  renameSync('/metrics/credit.prom.tmp', '/metrics/credit.prom')
  console.log(`AWS credit monitor: ${action}. Account changes require the owner.`)
  // Alertmanager receives these textfile metrics and sends Telegram warnings.
} catch {
  console.error('AWS credit monitor failed; no account or credential details logged.')
  process.exitCode = 1
} finally {
  client.destroy()
  budgets.destroy()
}
