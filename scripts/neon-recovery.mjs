#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import {
  buildLogicalBackupArguments,
  buildRestoreArguments,
  validateRecoveryApproval
} from '../src/operations/recovery.ts';

const action = process.argv[2] ?? 'plan';
const directURL = process.env.DATABASE_DIRECT_URL;
const temporaryURL = process.env.NEON_RECOVERY_TEMPORARY_URL;
const liveURL = process.env.NEON_RECOVERY_LIVE_URL ?? directURL;

if (action === 'plan') {
  if (!directURL || !temporaryURL || !liveURL)
    throw new Error('direct, live, and temporary recovery URLs are required');
  const backup = buildLogicalBackupArguments(directURL);
  const restore = buildRestoreArguments(liveURL, temporaryURL, '<approved-backup-path>');
  console.log(
    JSON.stringify({
      backup: backup.slice(0, -1).concat('<direct-url>'),
      restore: restore.slice(0, -2).concat(['<temporary-direct-url>', '<approved-backup-path>'])
    })
  );
  process.exit(0);
}

if (action === 'backup') {
  const outputPath = process.env.NEON_BACKUP_OUTPUT;
  if (!directURL || !outputPath) throw new Error('DATABASE_DIRECT_URL and NEON_BACKUP_OUTPUT are required');
  const args = buildLogicalBackupArguments(directURL);
  const result = spawnSync(args[0], [...args.slice(1, -1), `--file=${outputPath}`, args.at(-1)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (action === 'restore') {
  const backupPath = process.env.NEON_BACKUP_INPUT;
  const approvalPath = process.env.NEON_RECOVERY_APPROVAL_FILE;
  if (!directURL || !temporaryURL || !backupPath || !liveURL) {
    throw new Error('live, temporary, direct, and backup inputs are required');
  }
  if (!approvalPath || !process.env.MMDC_ENVIRONMENT) {
    throw new Error('MMDC_ENVIRONMENT and NEON_RECOVERY_APPROVAL_FILE are required for restore');
  }
  let approval;
  try {
    approval = JSON.parse(await readFile(approvalPath, 'utf8'));
  } catch {
    throw new Error('recovery approval file could not be read');
  }
  validateRecoveryApproval(approval, process.env.MMDC_ENVIRONMENT);
  const args = buildRestoreArguments(liveURL, temporaryURL, backupPath);
  const result = spawnSync(args[0], args.slice(1), { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

throw new Error(`unknown recovery action: ${action}`);
