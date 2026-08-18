import assert from 'node:assert/strict';
import { buildDesiredState, canonicalize, sha256Text } from '../../scripts/release-publication.mjs';
import {
  MAX_LOG_BYTES,
  MAX_STATUS_BYTES,
  verifyDeploymentEvidence
} from '../../scripts/deployment-evidence-verifier.mjs';

const repository = 'mmdcjpaul/mmdc-core';
const imageRepository = '123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/mmdc-v3-development';
const gitSha = '0123456789abcdef0123456789abcdef01234567';
const tag = 'v1.2.3-dev.4';
const digest = `sha256:${'d'.repeat(64)}`;
const previousDigest = `sha256:${'c'.repeat(64)}`;
const migrationVersion = '20260818_000004_media_governance';
const observedAt = '2026-08-18T06:40:00Z';
const releaseId = `${repository}@${tag}`;

const workflow = {
  eventName: 'push',
  ref: `refs/tags/${tag}`,
  refType: 'tag',
  workflowRef: `${repository}/.github/workflows/release.yml@refs/heads/development`,
  runId: 'f09-t03-synthetic-0001',
  actor: 'f09-t03-fixture'
};

const document = buildDesiredState({
  repository: imageRepository,
  tag,
  gitSha,
  digest,
  migrationVersion,
  evidence: { sbomSha256: 'a'.repeat(64), provenanceSha256: 'b'.repeat(64), publicationSha256: 'c'.repeat(64) },
  workflow,
  issuedAt: observedAt
});

const artifact = (kind, suffix) => ({
  kind,
  sha256: sha256Text(`${kind}:${suffix}`),
  ref: `retained://f09-t03/${kind}/${suffix}`
});

const stage = (name, status) => ({ name, status, releaseId, correlationId: 'f09-t03-correlation-0001' });

const scenarioStatuses = {
  'happy-path': ['succeeded', 'deployment-health-gate-passed'],
  'branch-push': ['rejected', 'branch-push-rejected'],
  'invalid-tag-ref': ['rejected', 'invalid-tag-or-ref-rejected'],
  'wrong-environment': ['rejected', 'wrong-environment-rejected'],
  'duplicate-state': ['idempotent', 'duplicate-desired-state'],
  'stale-state': ['rejected', 'stale-desired-state'],
  'tampered-state': ['rejected', 'desired-state-integrity-or-contract-failure'],
  'failed-migration': ['migration-failed', 'migration-failed-before-cutover'],
  'failed-health-compatible-rollback': ['rolled-back', 'target-health-failed-compatible-rollback'],
  'incompatible-safe-state': ['safe-state', 'target-health-failed-incompatible-or-rollback-failed']
};

const makeEvidence = (scenario) => {
  const [finalStatus, reason] = scenarioStatuses[scenario];
  const correlationId = `f09-t03-${scenario}`;
  const targetServices = ['failed-health-compatible-rollback', 'incompatible-safe-state'].includes(scenario)
    ? previousDigest
    : digest;
  const stageStatuses = {
    source: 'passed',
    publication: 'passed',
    'desired-state': 'passed',
    migration: 'passed',
    services: 'passed',
    probes: 'passed',
    'final-status': 'passed',
    artifacts: 'passed',
    approvals: 'passed'
  };
  if (scenario === 'branch-push' || scenario === 'invalid-tag-ref') stageStatuses.source = 'rejected';
  if (['branch-push', 'invalid-tag-ref', 'wrong-environment', 'stale-state', 'tampered-state'].includes(scenario)) {
    stageStatuses.publication = 'rejected';
    stageStatuses['desired-state'] = 'not-published';
    stageStatuses.migration = 'not-run';
    stageStatuses.services = 'unchanged';
    stageStatuses.probes = 'not-run';
  }
  if (scenario === 'duplicate-state') stageStatuses.migration = 'skipped';
  if (scenario === 'failed-migration') {
    stageStatuses.migration = 'failed';
    stageStatuses.services = 'unchanged';
    stageStatuses.probes = 'not-run';
  }
  if (scenario === 'failed-health-compatible-rollback') stageStatuses.services = 'rolled-back';
  if (scenario === 'incompatible-safe-state') stageStatuses.services = 'safe-state';

  const evidence = {
    schemaVersion: 1,
    evidenceType: 'deployment-acceptance',
    authenticity: 'synthetic',
    synthetic: true,
    scenario,
    environment: 'development',
    repository,
    releaseId,
    correlationId,
    release: { tag, semanticVersion: '1.2.3-dev.4', gitSha },
    source: { ...workflow, repository },
    publication: {
      repository: imageRepository,
      tag,
      gitSha,
      gitShaTag: `${imageRepository}:${gitSha}`,
      ecrDigest: digest
    },
    desiredState: {
      environment: 'development',
      digest,
      canonicalSha256: document.integrity.canonicalSha256,
      artifactSha256: sha256Text(canonicalize(document)),
      migrationVersion,
      document
    },
    migration: {
      gitSha,
      digest,
      version: migrationVersion,
      status: scenario === 'failed-migration' ? 'failed' : 'succeeded'
    },
    previous: { digest: previousDigest, releaseOrder: scenario === 'stale-state' ? [1, 2, 3, 5] : [1, 2, 3, 3] },
    services: {
      web: { digest: targetServices, releaseId },
      worker: { digest: targetServices, releaseId }
    },
    probes: ['health', 'route', 'admin', 'database', 'search', 'media'].map((name) => ({
      name,
      status: [
        'branch-push',
        'invalid-tag-ref',
        'wrong-environment',
        'stale-state',
        'tampered-state',
        'failed-migration'
      ].includes(scenario)
        ? 'not-run'
        : scenario === 'failed-health-compatible-rollback' || scenario === 'incompatible-safe-state'
          ? name === 'health'
            ? 'failed'
            : 'passed'
          : 'passed',
      digest: targetServices,
      releaseId,
      observedAt
    })),
    final: { status: finalStatus, reason, releaseId, correlationId, observedAt },
    status: {
      schemaVersion: 1,
      environment: 'development',
      status: finalStatus,
      reason,
      gitSha,
      tag,
      targetDigest: digest,
      releaseId,
      correlationId,
      sanitized: true
    },
    stages: Object.entries(stageStatuses).map(([name, status]) => stage(name, status)),
    approvals: [
      {
        approver: 'synthetic-fixture',
        approvedAt: observedAt,
        scope: `synthetic ${tag} development release`,
        evidenceRef: 'retained://f09-t03/approval/fixture',
        source: 'synthetic-fixture'
      }
    ],
    artifacts: [
      artifact('sbom', gitSha),
      artifact('provenance', gitSha),
      artifact('desired-state', gitSha),
      artifact('status', gitSha)
    ],
    logs: Object.entries(stageStatuses).map(([stageName, status]) => ({
      at: observedAt,
      stage: stageName,
      status,
      releaseId,
      correlationId,
      message: `${stageName} ${status}`
    }))
  };
  if (scenario === 'branch-push')
    evidence.source = { ...evidence.source, ref: 'refs/heads/development', refType: 'branch' };
  if (scenario === 'invalid-tag-ref') evidence.source = { ...evidence.source, ref: 'refs/tags/not-a-development-tag' };
  if (scenario === 'wrong-environment') evidence.source = { ...evidence.source, declaredEnvironment: 'production' };
  if (scenario === 'tampered-state') {
    evidence.desiredState.tamperDetected = true;
    evidence.desiredState.presentedCanonicalSha256 = 'e'.repeat(64);
  }
  return evidence;
};

const assertAccepted = (evidence, scenario) => {
  const result = verifyDeploymentEvidence(evidence, { expectedScenario: scenario });
  assert.equal(
    result.ok,
    true,
    `${scenario} should be accepted as a deterministic scenario record: ${result.errors.join('; ')}`
  );
};

for (const scenario of Object.keys(scenarioStatuses)) assertAccepted(makeEvidence(scenario), scenario);

const happy = makeEvidence('happy-path');
assert.equal(
  verifyDeploymentEvidence(happy, { requireAuthentic: true }).ok,
  false,
  'synthetic evidence must fail the authentic gate'
);

const substitution = makeEvidence('happy-path');
substitution.services.worker.digest = previousDigest;
assert.match(verifyDeploymentEvidence(substitution).errors.join('\n'), /running worker digest/);

const crossReleaseLog = makeEvidence('happy-path');
crossReleaseLog.logs[0].releaseId = `${repository}@v1.2.3-dev.3`;
assert.match(verifyDeploymentEvidence(crossReleaseLog).errors.join('\n'), /cross-release/);

const oversizedLog = makeEvidence('happy-path');
oversizedLog.logs = [{ ...oversizedLog.logs[0], message: 'x'.repeat(MAX_LOG_BYTES + 1) }];
assert.match(verifyDeploymentEvidence(oversizedLog).errors.join('\n'), /logs exceed/);

const oversizedStatus = makeEvidence('happy-path');
oversizedStatus.status.padding = 'x'.repeat(MAX_STATUS_BYTES + 1);
assert.match(verifyDeploymentEvidence(oversizedStatus).errors.join('\n'), /status exceeds/);

const secret = makeEvidence('happy-path');
secret.logs[0].message = ['DATABASE_URL=', 'postgresql://', 'user', ':', 'password', '@example.invalid/db'].join('');
assert.match(verifyDeploymentEvidence(secret).errors.join('\n'), /sensitive value/);

console.log(
  'F09-T03 probe passed end-to-end identifier reconciliation, rejection/idempotency/rollback/safe-state scenarios, substitution detection, synthetic/authentic separation, and bounded sanitized log/status checks'
);
