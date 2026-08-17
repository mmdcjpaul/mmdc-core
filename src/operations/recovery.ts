import { validateDatabaseConnection } from './neon.ts';

export class RecoveryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryContractError';
  }
}

export type RecoveryApproval = {
  approvalId: string;
  approver: string;
  environment: string;
  action: 'restore';
  cutoverProcedureId: string;
  approvedAt: string;
  expiresAt: string;
};

export const validateRecoveryApproval = (approval: RecoveryApproval, environment: string, now = new Date()): void => {
  if (!approval.approvalId.trim() || !approval.approver.trim() || !approval.cutoverProcedureId.trim()) {
    throw new RecoveryContractError('restore approval must name an approval ID, approver, and cutover procedure');
  }
  if (approval.environment !== environment || approval.action !== 'restore') {
    throw new RecoveryContractError('restore approval does not match the recovery environment or action');
  }
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= approvedAt ||
    expiresAt <= now.getTime()
  ) {
    throw new RecoveryContractError('restore approval is invalid or expired');
  }
};

export const assertIsolatedRecoveryTarget = (liveDirectURL: string, temporaryDirectURL: string): void => {
  const live = validateDatabaseConnection(liveDirectURL, 'direct-administration');
  const temporary = validateDatabaseConnection(temporaryDirectURL, 'direct-administration');
  if (live.url.toString() === temporary.url.toString()) {
    throw new RecoveryContractError(
      'restore target must be an isolated temporary branch/environment, not the live branch'
    );
  }
};

export const buildLogicalBackupArguments = (directURL: string): string[] => {
  validateDatabaseConnection(directURL, 'direct-administration');
  return ['pg_dump', '--format=custom', '--no-owner', `--dbname=${directURL}`];
};

export const buildRestoreArguments = (
  liveDirectURL: string,
  temporaryDirectURL: string,
  backupPath: string
): string[] => {
  if (!backupPath.trim()) throw new RecoveryContractError('a logical backup path is required');
  assertIsolatedRecoveryTarget(liveDirectURL, temporaryDirectURL);
  validateDatabaseConnection(temporaryDirectURL, 'direct-administration');
  return ['pg_restore', '--format=custom', '--no-owner', `--dbname=${temporaryDirectURL}`, backupPath];
};
