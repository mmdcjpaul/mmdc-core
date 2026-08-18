import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const bootstrap = path.join(root, 'infrastructure/host/bootstrap.sh');
const template = path.join(root, 'infrastructure/cloudformation/development.json');
const evidence = path.join(root, 'docs/evidence/F08-T02-host-bootstrap.md');
const runbook = readFileSync(path.join(root, 'docs/runbooks/host-bootstrap.md'), 'utf8');
const productionCompose = readFileSync(path.join(root, 'infrastructure/compose/production.yml'), 'utf8');
const bootstrapText = readFileSync(bootstrap, 'utf8');
const templateText = readFileSync(template, 'utf8');
const templateDocument = JSON.parse(templateText);

// F08-T02's requested host is additive: the existing development instance
// remains in the template and the new instance has distinct physical names.
assert.equal(templateDocument.Resources.DevelopmentInstance.Type, 'AWS::Lightsail::Instance');
assert.equal(templateDocument.Resources.DevelopmentInstanceAdditional.Type, 'AWS::Lightsail::Instance');
assert.equal(templateDocument.Resources.DevelopmentStaticIpAdditional.Type, 'AWS::Lightsail::StaticIp');
assert.deepEqual(templateDocument.Resources.DevelopmentStaticIpAdditional.Properties.AttachedTo, {
  Ref: 'DevelopmentInstanceAdditional'
});
assert.equal(templateDocument.Resources.DevelopmentInstance.DeletionPolicy, 'Retain');
assert.equal(templateDocument.Resources.DevelopmentInstanceAdditional.DeletionPolicy, 'Retain');
assert.equal(templateDocument.Resources.DevelopmentInstanceAdditional.UpdateReplacePolicy, 'Retain');
assert.equal(
  templateDocument.Resources.DevelopmentInstance.Properties.InstanceName['Fn::Sub'],
  '${ProjectName}-${EnvironmentName}-app'
);
assert.equal(
  templateDocument.Resources.DevelopmentInstanceAdditional.Properties.InstanceName['Fn::Sub'],
  '${ProjectName}-${EnvironmentName}-app-02'
);
assert.notEqual(
  templateDocument.Resources.DevelopmentInstance.Properties.InstanceName['Fn::Sub'],
  templateDocument.Resources.DevelopmentInstanceAdditional.Properties.InstanceName['Fn::Sub']
);

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const mode = (file) => (statSync(file).mode & 0o777).toString(8).padStart(3, '0');
const assertFile = (file) => assert.equal(existsSync(file), true, `expected file ${file}`);

assert.equal(bootstrapText.startsWith('#!/usr/bin/env bash'), true);
assert.match(bootstrapText, /set -Eeuo pipefail/);
assert.doesNotMatch(bootstrapText, /\b(?:pnpm|npm|yarn|git|make|gcc|node)\b/, 'bootstrap does not compile source');
for (const required of [
  'docker-ce',
  'docker-compose-plugin',
  'postgresql-client',
  'shared.yml',
  'production.yml',
  'Caddyfile',
  'mmdc-pull-agent',
  'mmdc-neon-backup',
  'logrotate.d/mmdc',
  'mmdc-pull-agent.service',
  'runtime.env',
  'pull.env',
  'backup.env'
]) {
  assert.match(bootstrapText, new RegExp(required.replace(/[./]/g, '\\$&')));
}

const secretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /ASIA[0-9A-Z]{16}/,
  /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i,
  /Bearer\s+[A-Za-z0-9._-]{12,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:PAYLOAD_SECRET|NEON_API_KEY|AWS_SECRET_ACCESS_KEY|S3_SECRET_ACCESS_KEY)\s*=/i
];
for (const file of [
  bootstrap,
  path.join(root, 'infrastructure/host/mmdc-pull-agent.sh'),
  path.join(root, 'infrastructure/host/mmdc-neon-backup.sh'),
  template
]) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) assert.equal(pattern.test(text), false, `${file} contains ${pattern}`);
}
assert.doesNotMatch(bootstrapText, /UserData|CloudFormation|aws\s+(?:cloudformation|s3|ecr)/i);
assert.doesNotMatch(templateText, /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}/);

for (const required of [
  'aws sts get-caller-identity --profile mmdc-iaac',
  'aws cloudformation validate-template',
  'cfn-lint --region ap-southeast-1',
  'aws cloudformation describe-change-set',
  'region, names, Lightsail bundle',
  'public ports',
  'IAM principals/actions/resources/conditions',
  'cost estimate',
  'deletion/update-replace policies',
  'required tags',
  'explicit approval for that exact change-set'
])
  assert.match(runbook, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+')));
assert.doesNotMatch(runbook, /^\s*aws cloudformation execute-change-set/m);

// Run the actual bootstrap twice against a disposable root. Command shims
// model package/systemd/Docker APIs, while all generated files are real files
// and their modes/content are inspected below.
const temp = execFileSync('mktemp', ['-d', path.join(os.tmpdir(), 'mmdc-f08-t02.XXXXXX')], { encoding: 'utf8' }).trim();
const fakeBin = path.join(temp, 'bin');
const hostRoot = path.join(temp, 'host');
mkdirSync(fakeBin, { recursive: true });
mkdirSync(hostRoot, { recursive: true });
const log = path.join(temp, 'commands.log');
const externalEnv = path.join(temp, 'runtime.env');
const externalPullEnv = path.join(temp, 'pull.env');
const externalBackupEnv = path.join(temp, 'backup.env');
const externalSentinel = 'MMDC_RUNTIME_SENTINEL=external-only-value';
writeFileSync(externalEnv, `${externalSentinel}\n`, { mode: 0o600 });
writeFileSync(externalPullEnv, 'MMDC_PULL_SENTINEL=external-only-value\n', { mode: 0o600 });
writeFileSync(externalBackupEnv, 'MMDC_BACKUP_SENTINEL=external-only-value\n', { mode: 0o600 });
const writeShim = (name, body) => {
  const file = path.join(fakeBin, name);
  const script = `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "${log}"\n${body}\n`;
  writeFileSync(file, script, { mode: 0o755 });
  chmodSync(file, 0o755);
};

writeShim('apt-get', 'exit 0');
writeShim('systemctl', 'exit 0');
writeShim(
  'docker',
  '[ "$1" = compose ] && [ "$2" = version ] && { echo \'Docker Compose version v2.29.7\'; exit 0; }; exit 0'
);
writeShim('id', '[ "$1" = -u ] && { echo 1000; exit 0; }; exit 0');

const runBootstrap = () => {
  const result = spawnSync(bootstrap, [], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      MMDC_BOOTSTRAP_TEST: '1',
      MMDC_BOOTSTRAP_ROOT: hostRoot,
      MMDC_BOOTSTRAP_SOURCE_ROOT: root,
      MMDC_RUNTIME_ENV_SOURCE: externalEnv,
      MMDC_PULL_ENV_SOURCE: externalPullEnv,
      MMDC_BACKUP_ENV_SOURCE: externalBackupEnv
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(externalSentinel));
};
runBootstrap();
// Store a digest of paths and bytes without relying on timestamps or directory order.
const digestTree = () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(`${path.relative(hostRoot, file)}:${sha256(file)}:${mode(file)}`);
    }
  };
  walk(hostRoot);
  return createHash('sha256').update(files.join('\n')).digest('hex');
};
const treeBefore = digestTree();
runBootstrap();
assert.equal(digestTree(), treeBefore, 'second bootstrap changed the generated tree');

for (const relative of [
  'etc/mmdc/compose/shared.yml',
  'etc/mmdc/compose/production.yml',
  'etc/mmdc/compose/Caddyfile',
  'usr/local/libexec/mmdc-pull-agent',
  'usr/local/libexec/mmdc-neon-backup',
  'etc/systemd/system/mmdc-pull-agent.service',
  'etc/logrotate.d/mmdc'
])
  assertFile(path.join(hostRoot, relative));
for (const relative of [
  'etc/mmdc/runtime.env',
  'etc/mmdc/pull.env',
  'etc/mmdc/backup.env',
  'etc/mmdc/pull-agent.env'
]) {
  assert.equal(mode(path.join(hostRoot, relative)), '600', `${relative} is root-readable only`);
}
assert.equal(readFileSync(path.join(hostRoot, 'etc/mmdc/runtime.env'), 'utf8'), `${externalSentinel}\n`);
assert.match(readFileSync(log, 'utf8'), /apt-get update/);
assert.match(readFileSync(log, 'utf8'), /docker-ce/);
assert.match(readFileSync(log, 'utf8'), /systemctl enable --now docker/);
assert.match(readFileSync(log, 'utf8'), /systemctl enable mmdc-pull-agent\.service/);
assert.match(readFileSync(log, 'utf8'), /systemctl start mmdc-pull-agent\.service/);
for (const pattern of secretPatterns)
  assert.equal(pattern.test(readFileSync(log, 'utf8')), false, `bootstrap log contains ${pattern}`);
assert.doesNotMatch(readFileSync(log, 'utf8'), new RegExp(externalSentinel));

// Recreation-related repository proof: service boundaries are private except
// for Caddy's 80/443 listeners, and the host artifact uses the same image
// contract rather than a source build.
assert.match(productionCompose, /networks:\s*\[mmdc-internal\]/);
assert.match(productionCompose, /caddy:/);
assert.doesNotMatch(productionCompose, /ports:\s*\n(?:\s+-.*\n)*\s+-.*7700/);
assert.match(readFileSync(path.join(root, 'infrastructure/host/mmdc-neon-backup.sh'), 'utf8'), /DATABASE_DIRECT_URL/);
assert.match(
  readFileSync(path.join(root, 'infrastructure/host/mmdc-neon-backup.sh'), 'utf8'),
  /pooled DATABASE_URL cannot be used/
);

// Authentic external evidence is a separate gate. A blocked form is useful
// history but is not allowed to satisfy approval or recreation criteria.
const evidenceText = readFileSync(evidence, 'utf8');
const valueFor = (label) => {
  const line = evidenceText.split(/\r?\n/).find((candidate) => candidate.split('|')[1]?.trim() === label);
  return line ? line.split('|')[2].trim() : '';
};
assert.equal(
  valueFor('Evidence state'),
  'Approved',
  'external evidence must be accepted only after the guarded gates pass'
);
const pending = [
  'AWS identity account',
  'AWS identity caller',
  'Identity verified at (UTC)',
  'CloudFormation template SHA-256',
  'Change-set ARN or identifier',
  'Planning cost estimate',
  'Exact-change-set approver',
  'Approval timestamp (UTC)',
  'Non-secret stack outputs',
  'Recreation environment',
  'Bootstrap run identifier',
  'Installed Docker/Compose version',
  'Installed Caddy version',
  'Installed pull-agent version',
  'Installed backup-tool version',
  'Private service-boundary result',
  'Deployment-ready result',
  'Host source-build result'
];
for (const label of pending) assert.notEqual(valueFor(label), '', `evidence form records ${label}`);

assert.match(valueFor('AWS identity account'), /^\d{12}$/);
assert.match(
  valueFor('AWS identity caller'),
  /^(arn:aws:iam::\d{12}:(?:user|role)\/.+|arn:aws:sts::\d{12}:assumed-role\/.+)$/
);
assert.match(valueFor('CloudFormation template SHA-256'), /^sha256=[a-f0-9]{64}$/);
assert.equal(valueFor('CloudFormation template SHA-256'), `sha256=${sha256(template)}`);
assert.match(valueFor('Identity verified at (UTC)'), /^20\d{2}-\d{2}-\d{2}T.*Z$/);
const approvalTimestamp = valueFor('Approval timestamp (UTC)');
const approvalSemantics = valueFor('Approval evidence semantics');
const approvalHasIsoTimestamp = /^20\d{2}-\d{2}-\d{2}T.*Z$/.test(approvalTimestamp);
const approvalHasTruthfulOrderingAttestation =
  /not exposed by client/i.test(approvalTimestamp) &&
  /ordering attestation only/i.test(approvalTimestamp) &&
  /exact approval preceded CloudFormation execution, which completed at 20\d{2}-\d{2}-\d{2}T.*Z/i.test(
    approvalTimestamp
  ) &&
  /exact ARN\/digest\/action approval/i.test(approvalSemantics) &&
  /client timestamp is not inferred/i.test(approvalSemantics);
assert.equal(
  approvalHasIsoTimestamp || approvalHasTruthfulOrderingAttestation,
  true,
  'approval evidence must contain an ISO timestamp or a truthful ordering attestation'
);
assert.match(valueFor('Exact-change-set approver'), /User.*explicit.*go ahead/i);
assert.match(valueFor('Change-set ARN or identifier'), /^(arn:aws:cloudformation:|[A-Za-z0-9][A-Za-z0-9._-]{2,})/);
assert.doesNotMatch(evidenceText, /PENDING_EXTERNAL_EVIDENCE|None —|<[^>]+>/);
assert.match(valueFor('Planning cost estimate'), /USD\s+(?:40.?265|80.?345)/);
assert.notEqual(valueFor('Exact-change-set approver'), '');
assert.notEqual(valueFor('Non-secret stack outputs'), '');
for (const label of pending.slice(10)) assert.doesNotMatch(valueFor(label), /PENDING|None|not collected/i);
assert.match(valueFor('Installed Docker/Compose version'), /Docker|Compose|v?\d+\.\d+/i);
assert.match(valueFor('Installed Caddy version'), /Caddy|v?\d+\.\d+/i);
assert.match(valueFor('Installed pull-agent version'), /F08-T02|pull-agent|v?\d+\.\d+/i);
assert.match(valueFor('Installed backup-tool version'), /pg_dump|postgres|v?\d+\.\d+/i);
assert.match(valueFor('Private service-boundary result'), /pass|verified|private/i);
assert.match(valueFor('Deployment-ready result'), /Phase 8 readiness-ready/i);
assert.match(valueFor('Deployment-ready result'), /Phase 9/i);
assert.match(valueFor('Host source-build result'), /no source build|not built|none/i);
console.log('F08-T02 probe passed repository bootstrap, isolation, boundary, and evidence-shape checks');
