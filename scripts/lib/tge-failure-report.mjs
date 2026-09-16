/**
 * Operator-facing TGE confirm failure reports (HoodLock contingency).
 * Pure formatting — no I/O.
 */

/**
 * Classify automated HoodLock lock certainty from a mutation failure result.
 *
 * @param {{
 *   ok?: boolean,
 *   lockStatus?: 'NONE' | 'UNCERTAIN' | 'VERIFIED',
 *   lockTxHash?: string | null,
 *   stage?: string | null,
 *   reason?: string | null,
 * }} result
 * @returns {'NONE' | 'UNCERTAIN' | 'VERIFIED'}
 */
export function classifyAutomatedLockStatus(result) {
  if (result?.ok) return 'VERIFIED';
  if (result?.lockStatus === 'NONE' || result?.lockStatus === 'UNCERTAIN' || result?.lockStatus === 'VERIFIED') {
    return result.lockStatus;
  }

  const reason = String(result?.reason ?? '');
  const stage = String(result?.stage ?? '');
  const hasLockTx = Boolean(result?.lockTxHash);

  if (!hasLockTx) return 'NONE';

  if (/RECEIPT NOT SUCCESSFUL/i.test(reason)) return 'NONE';

  // Receipt may have succeeded but proof incomplete, or storage mismatched.
  if (
    stage === 'FINAL_VERIFICATION' ||
    /DECODE|AMBIGUOUS LOCKED|FINAL VERIFICATION|LOCK TOKEN|LOCK OWNER|RECORDED AMOUNT|UNLOCK SHORTER|ALREADY WITHDRAWN/i.test(
      reason,
    )
  ) {
    return 'UNCERTAIN';
  }

  // Lock tx hash present without a clear revert → treat as uncertain.
  return 'UNCERTAIN';
}

/**
 * @param {{
 *   dbRegistration?: 'UNSET' | 'REGISTERED_NEW' | 'ALREADY_REGISTERED' | 'BLOCKED' | 'FAILED' | 'UNKNOWN' | null,
 *   mutated?: boolean,
 *   canonicalTape?: string | null,
 * }} result
 */
export function classifyOfficialTapeDbVisibility(result) {
  if (result?.dbRegistration) return result.dbRegistration;
  if (result?.canonicalTape) {
    return result.mutated ? 'REGISTERED_NEW_OR_EXISTING' : 'ALREADY_REGISTERED_OR_READ';
  }
  return 'UNKNOWN';
}

/**
 * Format stderr/stdout failure report for --confirm.
 *
 * @param {{
 *   ok?: boolean,
 *   reason?: string | null,
 *   stage?: string | null,
 *   mutated?: boolean,
 *   lockTxHash?: string | null,
 *   approvalTxHash?: string | null,
 *   lockId?: string | null,
 *   canonicalTape?: string | null,
 *   lockStatus?: 'NONE' | 'UNCERTAIN' | 'VERIFIED',
 *   dbRegistration?: string | null,
 *   liveFeeEth?: string,
 *   maxFeeEth?: string,
 *   expected?: string,
 *   balance?: string,
 *   deficit?: string,
 *   signer?: string,
 *   devBuyWallet?: string,
 *   takeover?: {
 *     token?: string | null,
 *     owner?: string | null,
 *     amountRaw?: string | null,
 *     spender?: string | null,
 *   } | null,
 * }} result
 */
export function formatTgeConfirmFailure(result) {
  const lockStatus = classifyAutomatedLockStatus(result);
  const dbVisibility = classifyOfficialTapeDbVisibility(result);
  const lines = [];

  lines.push('TGE FINALIZATION FAILED — DEV TOKEN LOCK NOT VERIFIED');
  lines.push('');
  lines.push(`Stage: ${result.stage ?? '(unspecified)'}`);
  lines.push(`Reason: ${result.reason ?? 'TGE finalization failed.'}`);
  lines.push('');

  lines.push('Official TAPE address:');
  if (dbVisibility === 'REGISTERED_NEW') {
    lines.push('  REGISTERED (newly written this run)');
  } else if (dbVisibility === 'ALREADY_REGISTERED') {
    lines.push('  REGISTERED (already matched candidate)');
  } else if (
    dbVisibility === 'REGISTERED_NEW_OR_EXISTING' ||
    dbVisibility === 'ALREADY_REGISTERED_OR_READ'
  ) {
    lines.push('  REGISTERED (canonical address known to this run)');
  } else if (dbVisibility === 'UNSET') {
    lines.push('  UNSET');
  } else if (dbVisibility === 'BLOCKED' || dbVisibility === 'FAILED') {
    lines.push(`  ${dbVisibility}`);
  } else {
    lines.push('  UNKNOWN — query protocol_settings.tape_official_contract');
  }
  if (result.canonicalTape) {
    lines.push(`  Address: ${result.canonicalTape}`);
  }

  lines.push('');
  lines.push('Dev-token HoodLock:');
  if (lockStatus === 'NONE') {
    lines.push('  NOT VERIFIED — no successful automated lock proven');
    lines.push('  Automated lock status: NO LOCK');
  } else if (lockStatus === 'UNCERTAIN') {
    lines.push('  NOT VERIFIED — automated proof incomplete');
    lines.push(
      '  AUTOMATED LOCK STATUS UNCERTAIN — VERIFY ON-CHAIN BEFORE MANUAL TAKEOVER',
    );
  } else {
    lines.push('  VERIFIED');
  }

  lines.push('');
  lines.push('TGE finalization: INCOMPLETE');

  if (result.approvalTxHash) {
    lines.push('');
    lines.push(`Approval tx: ${result.approvalTxHash}`);
  }
  if (result.lockTxHash) {
    lines.push(`Lock tx: ${result.lockTxHash}`);
  }
  if (result.lockId != null) {
    lines.push(`Lock id (unverified/partial): ${result.lockId}`);
  }
  if (result.liveFeeEth) {
    lines.push(`HoodLock live fee: ${result.liveFeeEth} ETH`);
    if (result.maxFeeEth) {
      lines.push(`Maximum permitted: ${result.maxFeeEth} ETH`);
    }
  }
  if (result.expected != null && result.balance != null) {
    lines.push(`Expected tokensOut: ${result.expected}`);
    lines.push(`Wallet balance: ${result.balance}`);
    if (result.deficit != null) lines.push(`Deficit: ${result.deficit}`);
  }
  if (result.signer || result.devBuyWallet) {
    lines.push(`Signer: ${result.signer ?? '(n/a)'}`);
    lines.push(`Dev-buy wallet: ${result.devBuyWallet ?? '(n/a)'}`);
  }

  const t = result.takeover;
  if (t && (t.token || t.owner || t.amountRaw || t.spender)) {
    lines.push('');
    lines.push('Manual HoodLock takeover parameters (from this run):');
    if (t.token) lines.push(`  Token: ${t.token}`);
    if (t.owner) lines.push(`  Owner / deployer: ${t.owner}`);
    if (t.amountRaw) lines.push(`  Amount (raw tokensOut): ${t.amountRaw}`);
    if (t.spender) lines.push(`  Approve spender (HoodLock): ${t.spender}`);
    lines.push('  Unlock: >= 6 UTC calendar months from lock submission time');
    lines.push('  Do NOT use wallet balanceOf as the lock amount.');
  }

  lines.push('');
  if (lockStatus === 'UNCERTAIN') {
    lines.push(
      'Action: run pnpm tape:verify-lock <TAPE> before any manual lock.',
    );
    lines.push(
      'Do not create a second HoodLock lock until no matching lock is proven.',
    );
  } else {
    lines.push('MANUAL HOODLOCK TAKEOVER REQUIRED');
    lines.push(
      'Action: verify no matching lock exists (pnpm tape:verify-lock <TAPE>), then complete via HoodLock UI if needed.',
    );
  }

  return lines.join('\n');
}
