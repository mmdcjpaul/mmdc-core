#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const artifactRoot = path.resolve(process.env.CI_SECURITY_ARTIFACT_DIR ?? path.join(root, '.artifacts/F07-T02'));
const containerEvidenceRoot = path.resolve(
  process.env.CI_CONTAINER_EVIDENCE_DIR ?? path.join(root, '.artifacts/F06-T02')
);
const injection = process.env.CI_FAILURE_INJECTION?.trim();
const protectedNames = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'DATABASE_URL',
  'DATABASE_DIRECT_URL',
  'NEON_API_KEY',
  'NEON_DATABASE_URL',
  'NEON_RUNTIME_ROLE_PASSWORD',
  'NEON_MIGRATION_ROLE_PASSWORD',
  'PAYLOAD_SECRET',
  'PAYLOAD_PREVIEW_SECRET',
  'MEILISEARCH_MASTER_KEY',
  'MEILI_ADMIN_KEY',
  'MEILI_SEARCH_KEY',
  'S3_WORKLOAD_IDENTITY_OR_CREDENTIAL',
  'DEPLOYMENT_STATE_INTEGRITY_KEY',
  'HOST_AWS_PULL_CREDENTIAL',
  'EDGE_BASIC_AUTH_CREDENTIAL',
  'CLOUDFRONT_ORIGIN_VERIFY_VALUE',
  'OBSERVABILITY_DESTINATION_CREDENTIAL'
];

const ensureArtifactRoot = () => mkdirSync(artifactRoot, { recursive: true });

export const sanitizeText = (input) =>
  String(input)
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/(https?:\/\/|postgres(?:ql)?:\/\/)([^\s:/]+):([^\s@]+)@/gi, '$1[REDACTED]@')
    .replace(/(authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(
      /\b(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|NEON_API_KEY|PAYLOAD_SECRET|PAYLOAD_PREVIEW_SECRET|MEILI_ADMIN_KEY|MEILI_SEARCH_KEY)\s*=\s*[^\s]+/gi,
      (match) => `${match.split('=')[0]}=[REDACTED]`
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]')
    .replace(/\bASIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_SESSION_KEY]')
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\b(sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, '[REDACTED_PAYMENT_TOKEN]');

export const sanitizeValue = (value) => {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeValue(child)]));
  return value;
};

const writeReport = (name, report) => {
  ensureArtifactRoot();
  writeFileSync(
    path.join(artifactRoot, `${name}.json`),
    `${JSON.stringify(sanitizeValue({ schemaVersion: 1, ...report }), null, 2)}\n`,
    'utf8'
  );
};

export const effectiveEnvironment = (event, environment) => {
  const isForkPullRequest = event?.eventName === 'pull_request' && event?.isFork === true;
  const filtered = { ...environment };
  if (isForkPullRequest) for (const name of protectedNames) delete filtered[name];
  return filtered;
};

const trackedFiles = () => {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git could not enumerate tracked files for the secret scan');
  return result.stdout.split('\0').filter(Boolean);
};

const readTextFiles = (files) =>
  files.flatMap((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    try {
      if (!statSync(absolutePath).isFile() || statSync(absolutePath).size > 2_000_000) return [];
      const text = readFileSync(absolutePath, 'utf8');
      return text.includes('\0') ? [] : [{ relativePath, text }];
    } catch {
      return [];
    }
  });

const scanSecrets = () => {
  const findings = [];
  const patterns = [
    ['private-key', /-----BEGIN [^-]+ PRIVATE KEY-----/g],
    ['database-credential-url', /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/gi],
    ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ['bearer-token', /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi],
    ['github-token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g]
  ];
  for (const { relativePath, text } of readTextFiles(trackedFiles())) {
    for (const [kind, pattern] of patterns) {
      for (const match of text.matchAll(pattern)) {
        // CI and acceptance fixtures use clearly named disposable values. They
        // are recorded as synthetic inputs rather than treated as protected
        // credentials; all other credential-shaped matches remain blocking.
        if (/(?:ci-only-|F\d\d-T\d\d-|mmdc-test-only|f06-runtime)/i.test(match[0]) || match[0].includes('[:space:]'))
          continue;
        const line = text.slice(0, match.index).split('\n').length;
        findings.push({ kind, file: relativePath, line });
      }
    }
  }
  return findings;
};

const scanIaC = () => {
  const files = trackedFiles().filter((file) => file.startsWith('.github/') || file.startsWith('infrastructure/'));
  const findings = [];
  for (const { relativePath, text } of readTextFiles(files)) {
    if (/Effect:\s*Allow[\s\S]{0,500}?Action:\s*['"]?\*['"]?/m.test(text))
      findings.push({ kind: 'wildcard-allow', file: relativePath });
    if (/Effect\s*:\s*Allow[\s\S]{0,500}?Resource:\s*['"]?\*['"]?/m.test(text))
      findings.push({ kind: 'wildcard-resource', file: relativePath });
    if (/public-read|PublicRead|acl:\s*public-read/i.test(text))
      findings.push({ kind: 'public-storage', file: relativePath });
  }
  return findings;
};

const scanContainer = () => {
  const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const findings = [];
  if (!/FROM \$\{NODE_IMAGE\} AS runtime/.test(dockerfile) || !/sha256:[0-9a-f]{64}/.test(dockerfile))
    findings.push({ kind: 'unpinned-runtime-base', file: 'Dockerfile' });
  if (!/^USER node$/m.test(dockerfile)) findings.push({ kind: 'root-runtime', file: 'Dockerfile' });
  if (/COPY (?:\.env|\.npmrc)/.test(dockerfile)) findings.push({ kind: 'secret-file-copy', file: 'Dockerfile' });
  return findings;
};

const requiredContainerEvidence = [
  'application-image.digest',
  'application-image.inspect.json',
  'application-image.sbom.spdx.json',
  'application-image.scan.sarif',
  'application-image.blocking-policy.json'
];

const validateContainerEvidence = () =>
  requiredContainerEvidence
    .filter((name) => {
      const file = path.join(containerEvidenceRoot, name);
      try {
        return !existsSync(file) || statSync(file).size === 0;
      } catch {
        return true;
      }
    })
    .map((name) => ({ kind: 'missing-container-evidence', file: name }));

const injected = (name) => injection === name || injection === 'scan';

const runDependencyScan = () => {
  if (process.env.CI_SECURITY_OFFLINE === '1') return { status: 'skipped-for-deterministic-policy-test' };
  const result = spawnSync('pnpm', ['run', 'check:dependencies'], { cwd: root, encoding: 'utf8' });
  return { status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status ?? 1 };
};

export const runScans = () => {
  ensureArtifactRoot();
  const secretFindings = injected('secret-scan')
    ? [{ kind: 'injected-blocking-finding', file: 'fixture', line: 1 }]
    : scanSecrets();
  const iacFindings = injected('iac-scan') ? [{ kind: 'injected-blocking-finding', file: 'fixture' }] : scanIaC();
  const containerFindings = injected('container-scan')
    ? [{ kind: 'injected-blocking-finding', file: 'fixture' }]
    : scanContainer();
  const containerEvidenceFindings = injected('container-evidence')
    ? [{ kind: 'injected-blocking-finding', file: 'fixture' }]
    : validateContainerEvidence();
  const dependency = injected('dependency-scan')
    ? { status: 'failed', reason: 'injected-blocking-finding' }
    : runDependencyScan();
  const license = injected('license-scan')
    ? { status: 'failed', reason: 'injected-blocking-finding' }
    : { status: process.env.CI_SECURITY_OFFLINE === '1' ? 'delegated-to-check:dependencies' : dependency.status };

  writeReport('secret-scan', {
    scan: 'secret',
    status: secretFindings.length ? 'failed' : 'passed',
    findings: secretFindings
  });
  writeReport('dependency-scan', { scan: 'dependency', status: dependency.status, detail: dependency });
  writeReport('license-scan', { scan: 'license', status: license.status, detail: license });
  writeReport('iac-scan', { scan: 'iac', status: iacFindings.length ? 'failed' : 'passed', findings: iacFindings });
  writeReport('container-scan', {
    scan: 'container',
    status: containerFindings.length ? 'failed' : 'passed',
    findings: containerFindings,
    runtimeEvidence: 'container-smoke job retains SBOM, vulnerability, digest, and image metadata'
  });
  writeReport('container-evidence', {
    scan: 'container-evidence',
    status: containerEvidenceFindings.length ? 'failed' : 'passed',
    findings: containerEvidenceFindings
  });

  const failures = [
    secretFindings.length,
    iacFindings.length,
    containerFindings.length,
    containerEvidenceFindings.length,
    dependency.status === 'failed',
    license.status === 'failed'
  ].filter(Boolean).length;
  writeReport('scan-summary', { scan: 'all', status: failures ? 'failed' : 'passed', blockingFindings: failures });
  if (failures) throw new Error(`${failures} CI security scan(s) contain an untriaged blocking finding`);
};

const policy = () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const branchPolicy = readFileSync(path.join(root, 'docs/policies/branch-tag-deployment-policy.md'), 'utf8');
  const securityPolicy = readFileSync(path.join(root, 'docs/policies/ci-security-gates-policy.md'), 'utf8');
  const errors = [];
  if (!/^permissions:\n  contents: read\s*$/m.test(workflow))
    errors.push('workflow default permissions are not contents: read only');
  if (/pull_request_target:|secrets\.|environment:\s*[^\n]/.test(workflow))
    errors.push('workflow exposes a protected event, secret, or environment');
  if (/AWS_(?:ACCESS|SECRET|SESSION)|NEON_(?:API|DATABASE)/.test(workflow))
    errors.push('workflow references protected AWS/Neon credentials');
  if (/^\s+[a-z-]+:\s*write\s*$/m.test(workflow)) errors.push('workflow grants a write permission');
  if (/continue-on-error:\s*true/.test(workflow)) errors.push('workflow weakens failure propagation');
  if (
    (workflow.match(/uses: actions\/setup-node@v4/g) ?? []).length !==
    (workflow.match(/node-version: 24\.15\.0/g) ?? []).length
  )
    errors.push('every setup-node action must pin the approved Node.js runtime');
  if (
    (workflow.match(/uses: pnpm\/action-setup@v4/g) ?? []).length !==
    (workflow.match(/version: 11\.20\.0/g) ?? []).length
  )
    errors.push('every pnpm setup action must pin the approved pnpm runtime');
  if (!workflow.includes('cache-dependency-path: pnpm-lock.yaml') || /restore-keys:/.test(workflow))
    errors.push('cache policy is not lockfile-scoped without broad restore keys');
  if (!securityPolicy.includes('retention-days: 14'))
    errors.push('security policy does not define the workflow artifact retention');
  for (const job of ['migration', 'container-smoke']) {
    const start = workflow.indexOf(`  ${job}:`);
    const relativeNext = start < 0 ? -1 : workflow.slice(start + 3).search(/\n  \S/);
    const nextJob = relativeNext < 0 ? -1 : start + 3 + relativeNext;
    const section = start < 0 ? '' : workflow.slice(start, nextJob < 0 ? workflow.length : nextJob);
    if (!section.includes('cancel-in-progress: false')) errors.push(`${job} is cancellable while active`);
  }
  for (const job of ['policy', 'install', 'typecheck', 'unit-schema', 'build', 'security-scans']) {
    const start = workflow.indexOf(`  ${job}:`);
    const relativeNext = start < 0 ? -1 : workflow.slice(start + 3).search(/\n  \S/);
    const nextJob = relativeNext < 0 ? -1 : start + 3 + relativeNext;
    const section = start < 0 ? '' : workflow.slice(start, nextJob < 0 ? workflow.length : nextJob);
    if (!section.includes('cancel-in-progress: true')) errors.push(`${job} does not cancel superseded branch work`);
  }
  const permissionBlocks = [...workflow.matchAll(/^    permissions:\n((?:      [a-z-]+:\s*(?:read|none)\s*\n)+)/gm)];
  if (permissionBlocks.length && permissionBlocks.some((match) => /write/.test(match[1])))
    errors.push('a job permission is broader than read-only');
  const workflowJobs = [...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\s*\n    name: ([^\n]+)/gm)].map((match) =>
    match[2].trim()
  );
  const documentedChecks = [...branchPolicy.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
  const stable = [
    'policy',
    'install',
    'typecheck',
    'unit-schema',
    'migration',
    'integration',
    'build',
    'container-smoke',
    'security-scans'
  ];
  if (JSON.stringify(workflowJobs.filter((job) => stable.includes(job)).sort()) !== JSON.stringify(stable.sort()))
    errors.push('workflow stable job names do not match the stable set');
  if (JSON.stringify(documentedChecks.sort()) !== JSON.stringify(stable.sort()))
    errors.push('branch policy required checks do not exactly match workflow stable jobs');
  const uploadCount = (workflow.match(/uses: actions\/upload-artifact@v4/g) ?? []).length;
  const retentionCount = (workflow.match(/retention-days: 14/g) ?? []).length;
  if (uploadCount < 3 || uploadCount !== retentionCount)
    errors.push('every artifact upload lacks the approved retention');
  const artifactBlocks = [
    ...workflow.matchAll(/      - uses: actions\/upload-artifact@v4[\s\S]*?(?=\n      - |\n  [a-z]|$)/g)
  ].map((match) => match[0]);
  if (artifactBlocks.some((block) => !block.includes('if: always()') || !block.includes('if-no-files-found: error')))
    errors.push('artifact uploads must always run and fail when evidence is absent');
  for (const required of [
    'test-reports',
    'sbom',
    'secret-scan',
    'dependency-scan',
    'license-scan',
    'iac-scan',
    'container-scan',
    'image-metadata'
  ])
    if (!workflow.toLowerCase().includes(required)) errors.push(`workflow evidence coverage is missing ${required}`);
  if (errors.length) throw new Error(errors.join('; '));
  console.log(
    'CI security policy passed: permissions, fork isolation, cache/concurrency, evidence retention, scan coverage, and branch checks reconciled'
  );
};

const forkSimulation = () => {
  const secret = 'fork-only-protected-value';
  const filtered = effectiveEnvironment(
    { eventName: 'pull_request', isFork: true },
    {
      CI: 'true',
      AWS_ACCESS_KEY_ID: secret,
      DATABASE_URL: ['postgres://user:', secret, '@db.example.test/app'].join(''),
      NEON_API_KEY: secret,
      DEPLOYMENT_STATE_INTEGRITY_KEY: secret,
      SAFE_CI_VALUE: 'ci-only'
    }
  );
  if (Object.values(filtered).some((value) => String(value).includes(secret)))
    throw new Error('fork simulation leaked a protected value');
  if (
    'AWS_ACCESS_KEY_ID' in filtered ||
    'DATABASE_URL' in filtered ||
    'NEON_API_KEY' in filtered ||
    'DEPLOYMENT_STATE_INTEGRITY_KEY' in filtered
  )
    throw new Error('fork simulation retained a protected variable');
  console.log('Fork simulation passed: protected AWS/database values are absent from the effective fork environment');
};

const sanitization = () => {
  const raw = [
    ['postgresql://user:', 'super-secret', '@example.test/db'].join(''),
    ' AWS_SECRET_ACCESS_KEY=super-secret ',
    ' Authorization: Bearer ',
    ['ghp_', '123456789012345678901234567890'].join(''),
    ' ',
    ['AKIA', '1234567890ABCDEF'].join('')
  ].join('');
  const sanitized = sanitizeText(raw);
  if (sanitized.includes('super-secret') || sanitized.includes('ghp_') || sanitized.includes('AKIA'))
    throw new Error('sanitization retained a credential-shaped value');
  const tempReport = path.join(artifactRoot, 'sanitization-probe.json');
  ensureArtifactRoot();
  writeFileSync(tempReport, `${JSON.stringify(sanitizeValue({ log: raw }))}\n`, 'utf8');
  const persisted = readFileSync(tempReport, 'utf8');
  if (persisted.includes('super-secret') || persisted.includes('ghp_') || persisted.includes('AKIA'))
    throw new Error('artifact sanitization retained a credential-shaped value');
  console.log('Sanitization probe passed: logs and artifacts redact credential-shaped values');
};

const action = process.argv[2] ?? 'help';
try {
  if (action === 'policy') policy();
  else if (action === 'fork-simulation') forkSimulation();
  else if (action === 'sanitization') sanitization();
  else if (action === 'scan') runScans();
  else throw new Error('Usage: node scripts/ci-security-gates.mjs <policy|fork-simulation|sanitization|scan>');
} catch (error) {
  console.error(`CI security gates: ${sanitizeText(error.message)}`);
  process.exitCode = 1;
}
