#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const packageStore = path.join(root, 'node_modules', '.pnpm');
const packageManifests = [];

if (!fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
  throw new Error('pnpm-lock.yaml is required for dependency triage.');
}

for (const packageEntry of fs.readdirSync(packageStore)) {
  const packageNodeModules = path.join(packageStore, packageEntry, 'node_modules');
  if (!fs.existsSync(packageNodeModules)) continue;

  for (const scopeOrPackage of fs.readdirSync(packageNodeModules)) {
    const scopePath = path.join(packageNodeModules, scopeOrPackage);
    const packageNames = scopeOrPackage.startsWith('@')
      ? fs.readdirSync(scopePath).map((name) => path.join(scopeOrPackage, name))
      : [scopeOrPackage];

    for (const packageName of packageNames) {
      const manifestPath = path.join(packageNodeModules, packageName, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      packageManifests.push(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    }
  }
}

const withoutLicense = packageManifests.filter((manifest) => !manifest.license && !manifest.licenses);
if (withoutLicense.length > 0) {
  throw new Error(`Packages without license metadata: ${withoutLicense.map((manifest) => manifest.name).join(', ')}`);
}

let auditOutput = '';
let auditExitCode = 0;
try {
  auditOutput = execFileSync('pnpm', ['audit', '--prod', '--json'], {
    cwd: root,
    encoding: 'utf8'
  });
} catch (error) {
  auditExitCode = error.status ?? 1;
  auditOutput = error.stdout ?? '';
}

let auditReport;
try {
  auditReport = JSON.parse(auditOutput);
} catch {
  throw new Error('pnpm audit did not return a machine-readable report.');
}

if (auditReport.error || !auditReport.metadata?.vulnerabilities) {
  throw new Error('pnpm audit returned an error instead of a vulnerability triage report.');
}

const vulnerabilities = auditReport.metadata.vulnerabilities;
console.log(
  `Dependency triage passed: ${packageManifests.length} package manifests have license metadata; ` +
    `audit exit ${auditExitCode}, vulnerabilities ${JSON.stringify(vulnerabilities)}.`
);

if (auditExitCode !== 0) {
  console.warn('Security findings are surfaced above for engineering triage; no advisory was suppressed.');
}
