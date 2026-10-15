export function assertRebuildAcceptance(evidence, release, percentage, mode) {
  if (mode === 'canary') {
    if (evidence.release !== release || evidence.deploymentRequested !== true || evidence.nodeMemberFlow !== true || evidence.restoreDrill !== true || evidence.measuredHeadroom !== true || evidence.ordinaryApiBudgets !== true || evidence.usesExistingHost !== true || evidence.newPaidServices !== false || !Array.isArray(evidence.deferredChecks) || !evidence.deferredChecks.length || !Number.isInteger(percentage) || percentage < 1 || percentage > 5) throw new Error('Canary activation requires verified baseline evidence, recorded deployment authorization and deferred checks, the existing host, no new paid services, and a 1–5% cohort.')
    return
  }
  if (evidence.release !== release || evidence.nodeMemberFlow !== true || evidence.restoreDrill !== true || evidence.physicalAndroid !== true || evidence.physicalSafari !== true || evidence.measuredHeadroom !== true || evidence.latencyBudgets !== true || evidence.playbackBudgets !== true || !Number.isFinite(evidence.recurringMAD) || evidence.recurringMAD <= 0 || evidence.recurringMAD > 250) throw new Error('Full activation requires the plan’s measured acceptance and recurring-cost evidence for this release.')
}
