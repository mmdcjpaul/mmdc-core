#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { canonicalize, sha256Text, verifyDesiredState } from './release-publication.mjs';

export const MAX_LOG_BYTES = 8192;
export const MAX_STATUS_BYTES = 8192;
export const MAX_LOG_ENTRIES = 100;
export const MAX_PROBE_ENTRIES = 32;

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-dev\.(0|[1-9]\d*)$/;
const RELEASE_ID = /^[A-Za-z0-9._/-]+@v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-dev\.(0|[1-9]\d*)$/;
const SCENARIOS = new Set([
  'happy-path',
  'branch-push',
  'invalid-tag-ref',
  'wrong-environment',
  'duplicate-state',
  'stale-state',
  'tampered-state',
  'failed-migration',
  'failed-health-compatible-rollback',
  'incompatible-safe-state'
]);
const REQUIRED_STAGES = [
  'source',
  'publication',
  'desired-state',
  'migration',
  'services',
  'probes',
  'final-status',
  'artifacts'
];
const SENSITIVE_VALUE =
  /(postgres(?:ql)?:\/\/[^\s]+|(?:password|secret|token|api[_-]?key|authorization|basic\s+auth)\s*[:=]|bearer\s+[A-Za-z0-9._-]{8,}|-----BEGIN [^-]+ PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})/i;
const SENSITIVE_FIELD =
  /(^|[._-])(password|secret|token|api[_-]?key|authorization|basicAuth|formPayload|requestBody|completePayload)($|[._-])/i;
const SYNTHETIC_VALUE = /(synthetic|fixture|dry[-_ ]?run|local[-_ ]?harness|fake|fabricat)/i;

const hasString = (value) => typeof value === 'string' && value.length > 0;
const isIso = (value) => typeof value === 'string' && ISO_8601.test(value);
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const add = (errors, message) => errors.push(message);

const walk = (value, path, visitor) => {
  visitor(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, visitor));
  else if (asObject(value)) Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`, visitor));
};

const assertHash = (value, label, errors) => {
  if (!HASH.test(String(value ?? ''))) add(errors, `${label} must be a lowercase SHA-256 hex value`);
};

const assertDigest = (value, label, errors) => {
  if (!DIGEST.test(String(value ?? ''))) add(errors, `${label} must be an immutable sha256 digest`);
};

const assertSha = (value, label, errors) => {
  if (!SHA.test(String(value ?? ''))) add(errors, `${label} must be a 40-character lowercase Git SHA`);
};

const validateSanitizedTree = (evidence, errors, { authentic }) => {
  walk(evidence, '$', (value, path) => {
    if (SENSITIVE_FIELD.test(path)) add(errors, `sensitive field is prohibited: ${path}`);
    if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) add(errors, `sensitive value is prohibited: ${path}`);
    if (authentic && typeof value === 'string' && SYNTHETIC_VALUE.test(value))
      add(errors, `authentic evidence contains a synthetic/fabricated marker: ${path}`);
  });
};

const validateBounds = (evidence, errors) => {
  const logs = Array.isArray(evidence.logs) ? evidence.logs : [];
  if (logs.length > MAX_LOG_ENTRIES) add(errors, `logs exceed the ${MAX_LOG_ENTRIES}-entry bound`);
  if (Buffer.byteLength(JSON.stringify(logs ?? []), 'utf8') > MAX_LOG_BYTES)
    add(errors, `logs exceed the ${MAX_LOG_BYTES}-byte bound`);
  logs.forEach((entry, index) => {
    if (!asObject(entry)) return add(errors, `log ${index} must be an object`);
    if (!hasString(entry.message) || Buffer.byteLength(entry.message, 'utf8') > 1024)
      add(errors, `log ${index} message is missing or exceeds 1024 bytes`);
    if (!isIso(entry.at)) add(errors, `log ${index} timestamp is not a UTC ISO-8601 value`);
    if (!hasString(entry.stage)) add(errors, `log ${index} stage is missing`);
    if (!hasString(entry.correlationId)) add(errors, `log ${index} correlationId is missing`);
    if (!hasString(entry.releaseId)) add(errors, `log ${index} releaseId is missing`);
  });

  if (!asObject(evidence.status)) return add(errors, 'bounded status object is missing');
  if (Buffer.byteLength(JSON.stringify(evidence.status), 'utf8') > MAX_STATUS_BYTES)
    add(errors, `status exceeds the ${MAX_STATUS_BYTES}-byte bound`);
  for (const field of [
    'schemaVersion',
    'environment',
    'status',
    'reason',
    'gitSha',
    'tag',
    'targetDigest',
    'releaseId',
    'correlationId'
  ]) {
    if (!(field in evidence.status)) add(errors, `status is missing required field: ${field}`);
  }
};

const validateArtifacts = (artifacts, errors) => {
  if (!Array.isArray(artifacts) || artifacts.length < 4)
    return add(errors, 'retained artifact references must include at least four artifacts');
  const kinds = new Set();
  for (const [index, artifact] of (artifacts ?? []).entries()) {
    if (!asObject(artifact)) {
      add(errors, `artifact ${index} must be an object`);
      continue;
    }
    if (!hasString(artifact.kind)) add(errors, `artifact ${index} kind is missing`);
    else kinds.add(artifact.kind);
    assertHash(artifact.sha256, `artifact ${index}.sha256`, errors);
    if (!hasString(artifact.ref)) add(errors, `artifact ${index} retained reference is missing`);
  }
  for (const required of ['sbom', 'provenance', 'desired-state', 'status'])
    if (!kinds.has(required)) add(errors, `retained artifact reference is missing: ${required}`);
};

const stageMap = (stages) =>
  new Map((Array.isArray(stages) ? stages : []).filter(asObject).map((stage) => [stage.name, stage]));

const expectStage = (map, name, status, errors) => {
  const stage = map.get(name);
  if (!stage) return add(errors, `required stage is missing: ${name}`);
  if (stage.status !== status) add(errors, `stage ${name} must be ${status}, got ${stage.status ?? 'missing'}`);
};

const verifyHappyStages = (map, errors) => {
  for (const stage of REQUIRED_STAGES) expectStage(map, stage, 'passed', errors);
  if (!map.has('approvals')) add(errors, 'required stage is missing: approvals');
};

const verifyScenarioStages = (map, scenario, errors) => {
  const rejectBeforeDesired = ['branch-push', 'invalid-tag-ref', 'wrong-environment', 'tampered-state', 'stale-state'];
  if (rejectBeforeDesired.includes(scenario)) {
    expectStage(
      map,
      'source',
      scenario === 'branch-push' || scenario === 'invalid-tag-ref' ? 'rejected' : 'passed',
      errors
    );
    expectStage(map, 'publication', 'rejected', errors);
    expectStage(map, 'desired-state', 'not-published', errors);
    expectStage(map, 'migration', 'not-run', errors);
    expectStage(map, 'services', 'unchanged', errors);
    expectStage(map, 'probes', 'not-run', errors);
    expectStage(map, 'final-status', 'passed', errors);
    return;
  }
  if (scenario === 'duplicate-state') {
    for (const stage of ['source', 'publication', 'desired-state', 'services', 'probes', 'final-status'])
      expectStage(map, stage, 'passed', errors);
    expectStage(map, 'migration', 'skipped', errors);
    return;
  }
  if (scenario === 'failed-migration') {
    for (const stage of ['source', 'publication', 'desired-state']) expectStage(map, stage, 'passed', errors);
    expectStage(map, 'migration', 'failed', errors);
    expectStage(map, 'services', 'unchanged', errors);
    expectStage(map, 'probes', 'not-run', errors);
    expectStage(map, 'final-status', 'passed', errors);
    return;
  }
  if (scenario === 'failed-health-compatible-rollback') {
    for (const stage of ['source', 'publication', 'desired-state', 'migration', 'probes', 'final-status'])
      expectStage(map, stage, 'passed', errors);
    expectStage(map, 'services', 'rolled-back', errors);
    return;
  }
  if (scenario === 'incompatible-safe-state') {
    for (const stage of ['source', 'publication', 'desired-state', 'migration', 'probes', 'final-status'])
      expectStage(map, stage, 'passed', errors);
    expectStage(map, 'services', 'safe-state', errors);
    return;
  }
  verifyHappyStages(map, errors);
};

const verifyApprovals = (approvals, { authentic, scenario }, errors) => {
  if (!Array.isArray(approvals) || approvals.length === 0) return add(errors, 'approval records are missing');
  for (const [index, approval] of approvals.entries()) {
    if (
      !asObject(approval) ||
      !hasString(approval.approver) ||
      !isIso(approval.approvedAt) ||
      !hasString(approval.scope)
    )
      add(errors, `approval ${index} must name an approver, UTC time, and scope`);
    if (!hasString(approval.evidenceRef)) add(errors, `approval ${index} retained evidence reference is missing`);
    if (authentic && approval.source === 'synthetic-fixture')
      add(errors, `approval ${index} is synthetic in authentic evidence`);
  }
  if (authentic && scenario === 'happy-path' && !approvals.some((approval) => approval.source !== 'synthetic-fixture'))
    add(errors, 'authentic happy-path evidence has no non-synthetic approval');
};

const verifyProbeAndServices = (evidence, releaseId, targetDigest, previousDigest, scenario, errors) => {
  const probes = Array.isArray(evidence.probes) ? evidence.probes : [];
  if (probes.length > MAX_PROBE_ENTRIES) add(errors, `probe results exceed the ${MAX_PROBE_ENTRIES}-entry bound`);
  for (const [index, probe] of probes.entries()) {
    if (!asObject(probe) || !hasString(probe.name) || !['passed', 'failed', 'not-run'].includes(probe.status))
      add(errors, `probe ${index} is malformed`);
    if (probe.releaseId !== releaseId) add(errors, `probe ${index} is correlated to a different release`);
    if (!isIso(probe.observedAt)) add(errors, `probe ${index} timestamp is invalid`);
    if (probe.status === 'passed' && probe.digest !== targetDigest && scenario === 'happy-path')
      add(errors, `probe ${index} digest does not match target release`);
  }
  const services = evidence.services;
  if (!asObject(services) || !asObject(services.web) || !asObject(services.worker))
    return add(errors, 'running web and worker digest evidence is missing');
  const expected = ['failed-health-compatible-rollback', 'incompatible-safe-state'].includes(scenario)
    ? previousDigest
    : targetDigest;
  for (const name of ['web', 'worker']) {
    assertDigest(services[name].digest, `running ${name} digest`, errors);
    if (services[name].digest !== expected)
      add(errors, `running ${name} digest does not match the ${scenario} outcome`);
    if (services[name].releaseId !== releaseId) add(errors, `running ${name} is correlated to a different release`);
  }
};

export const verifyDeploymentEvidence = (evidence, { requireAuthentic = false, expectedScenario } = {}) => {
  const errors = [];
  const authentic = evidence?.authenticity === 'authentic';
  const scenario = evidence?.scenario;
  if (!asObject(evidence) || evidence.schemaVersion !== 1 || evidence.evidenceType !== 'deployment-acceptance')
    add(errors, 'unsupported deployment evidence schema');
  if (!SCENARIOS.has(scenario)) add(errors, `unsupported or missing scenario: ${scenario ?? 'missing'}`);
  if (expectedScenario && scenario !== expectedScenario)
    add(errors, `expected scenario ${expectedScenario}, got ${scenario}`);
  if (requireAuthentic && !authentic)
    add(errors, 'authentic external release evidence is required; synthetic evidence cannot satisfy acceptance');
  if (authentic && evidence.synthetic === true) add(errors, 'authentic evidence cannot be marked synthetic');
  validateSanitizedTree(evidence, errors, { authentic });
  validateBounds(evidence, errors);

  const release = evidence.release ?? {};
  const source = evidence.source ?? {};
  const publication = evidence.publication ?? {};
  const desired = evidence.desiredState ?? {};
  const migration = evidence.migration ?? {};
  const releaseId = `${evidence.repository ?? ''}@${release.tag ?? ''}`;
  assertSha(release.gitSha, 'release.gitSha', errors);
  if (!TAG.test(String(release.tag ?? ''))) add(errors, 'release.tag is not a valid development semantic tag');
  if (!hasString(evidence.repository)) add(errors, 'repository is missing');
  if (evidence.environment !== 'development') add(errors, 'evidence environment must be development');
  if (evidence.releaseId !== releaseId || !RELEASE_ID.test(releaseId))
    add(errors, 'releaseId is not bound to repository and semantic tag');
  if (!hasString(evidence.correlationId)) add(errors, 'correlationId is missing');
  const sourceIsNormal = !['branch-push', 'invalid-tag-ref', 'wrong-environment'].includes(scenario);
  if (sourceIsNormal && (!hasString(source.ref) || source.ref !== `refs/tags/${release.tag}`))
    add(errors, 'source ref is not bound to the semantic tag');
  if (sourceIsNormal && (source.eventName !== 'push' || source.refType !== 'tag'))
    add(errors, 'source workflow is not an immutable tag push');
  if (
    scenario === 'branch-push' &&
    (source.eventName !== 'push' || source.refType !== 'branch' || source.ref !== 'refs/heads/development')
  )
    add(errors, 'branch-push rejection evidence does not identify the branch event');
  if (
    scenario === 'invalid-tag-ref' &&
    (source.eventName !== 'push' || source.refType !== 'tag' || source.ref === `refs/tags/${release.tag}`)
  )
    add(errors, 'invalid-tag-ref rejection evidence does not identify an invalid tag/ref');
  if (scenario === 'wrong-environment' && source.declaredEnvironment !== 'production')
    add(errors, 'wrong-environment rejection evidence does not identify the attempted environment');
  for (const field of ['workflowRef', 'runId', 'actor'])
    if (!hasString(source[field])) add(errors, `source workflow ${field} is missing`);
  if (source.repository && source.repository !== evidence.repository)
    add(errors, 'source repository does not match evidence repository');

  assertDigest(publication.ecrDigest, 'publication.ecrDigest', errors);
  if (publication.gitSha !== release.gitSha) add(errors, 'publication Git SHA does not match release');
  if (publication.tag !== release.tag) add(errors, 'publication semantic tag does not match release');
  if (
    !hasString(publication.repository) ||
    publication.repository.includes(':') ||
    publication.repository.includes('@')
  )
    add(errors, 'publication repository must be tag-free');
  if (publication.gitShaTag !== `${publication.repository}:${release.gitSha}`)
    add(errors, 'publication Git-SHA image tag is not bound to release');
  if (publication.ecrDigest !== desired.digest) add(errors, 'ECR digest and desired-state digest differ');

  const document = desired.document;
  if (!asObject(document)) add(errors, 'desired-state document is required to verify integrity');
  else {
    try {
      verifyDesiredState(document, { expectedEnvironment: 'development' });
    } catch (error) {
      add(errors, `embedded desired-state verification failed: ${error.message}`);
    }
    assertHash(desired.canonicalSha256, 'desiredState.canonicalSha256', errors);
    if (desired.canonicalSha256 !== document.integrity?.canonicalSha256)
      add(errors, 'desired-state canonical integrity is substituted');
    assertHash(desired.artifactSha256, 'desiredState.artifactSha256', errors);
    if (desired.artifactSha256 !== sha256Text(canonicalize(document)))
      add(errors, 'desired-state artifact digest is substituted');
    if (document.release?.gitSha !== release.gitSha || document.release?.tag !== release.tag)
      add(errors, 'desired-state release identity does not match source release');
    if (document.image?.digest !== publication.ecrDigest)
      add(errors, 'desired-state image digest does not match ECR digest');
    if (document.migration?.version !== migration.version)
      add(errors, 'desired-state migration version does not match deployment migration');
  }
  if (desired.environment !== evidence.environment)
    add(errors, 'desired-state environment does not match evidence environment');
  if (desired.digest !== publication.ecrDigest) add(errors, 'desired-state digest does not match publication');
  if (desired.migrationVersion !== migration.version) add(errors, 'desired-state migration version is inconsistent');
  if (migration.gitSha !== release.gitSha || migration.digest !== publication.ecrDigest)
    add(errors, 'migration evidence is cross-release');
  if (!hasString(migration.version) || !hasString(migration.status))
    add(errors, 'migration version or status is missing');

  const previousDigest = evidence.previous?.digest ?? publication.ecrDigest;
  assertDigest(previousDigest, 'previous digest', errors);
  verifyProbeAndServices(evidence, releaseId, publication.ecrDigest, previousDigest, scenario, errors);
  const final = evidence.final ?? {};
  if (final.releaseId !== releaseId || final.correlationId !== evidence.correlationId)
    add(errors, 'final status is not correlated to this release');
  if (!isIso(final.observedAt)) add(errors, 'final status timestamp is invalid');
  const expectedStatuses = {
    'happy-path': 'succeeded',
    'branch-push': 'rejected',
    'invalid-tag-ref': 'rejected',
    'wrong-environment': 'rejected',
    'duplicate-state': 'idempotent',
    'stale-state': 'rejected',
    'tampered-state': 'rejected',
    'failed-migration': 'migration-failed',
    'failed-health-compatible-rollback': 'rolled-back',
    'incompatible-safe-state': 'safe-state'
  };
  if (final.status !== expectedStatuses[scenario])
    add(errors, `final status for ${scenario} must be ${expectedStatuses[scenario]}`);
  if (!hasString(final.reason)) add(errors, 'final status reason is missing');
  if (evidence.status.releaseId !== releaseId || evidence.status.correlationId !== evidence.correlationId)
    add(errors, 'bounded status is not correlated to this release');
  if (evidence.status.gitSha !== release.gitSha || evidence.status.tag !== release.tag)
    add(errors, 'bounded status release identity does not match');
  if (
    evidence.status.targetDigest !== publication.ecrDigest &&
    !['branch-push', 'invalid-tag-ref', 'wrong-environment'].includes(scenario)
  )
    add(errors, 'bounded status target digest does not match ECR digest');
  if (evidence.status.status !== final.status) add(errors, 'bounded status and final status differ');

  if (scenario === 'tampered-state') {
    if (desired.tamperDetected !== true || desired.presentedCanonicalSha256 === desired.canonicalSha256)
      add(errors, 'tampered-state evidence does not retain the conflicting integrity values');
  }
  if (scenario === 'stale-state') {
    if (
      !Array.isArray(evidence.previous?.releaseOrder) ||
      evidence.previous.releaseOrder.join('.') <= document?.monotonic?.value
    )
      add(errors, 'stale-state evidence does not retain a newer active release order');
  }

  const stages = stageMap(evidence.stages);
  verifyScenarioStages(stages, scenario, errors);
  validateArtifacts(evidence.artifacts, errors);
  verifyApprovals(evidence.approvals, { authentic, scenario }, errors);
  for (const log of evidence.logs ?? []) {
    if (log.releaseId !== releaseId || log.correlationId !== evidence.correlationId)
      add(errors, 'log contains cross-release or cross-run correlation');
  }
  if (authentic) {
    const external = evidence.external ?? {};
    if (!hasString(external.provider) || !hasString(external.region) || !hasString(external.account))
      add(errors, 'authentic evidence must name provider, region, and account');
    if (!Array.isArray(external.retainedRefs) || external.retainedRefs.length === 0)
      add(errors, 'authentic evidence must retain external artifact references');
  }
  return {
    ok: errors.length === 0,
    errors,
    authentic,
    scenario,
    releaseId,
    bounded: errors.every((error) => !error.includes('bound'))
  };
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const main = () => {
  const args = process.argv.slice(2);
  const action = args.shift();
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]?.replace(/^--/, '');
    options[key] = args[index + 1]?.startsWith('--') ? true : args[++index];
  }
  if (action !== 'verify' || !options.input)
    throw new Error(
      'Usage: deployment-evidence-verifier.mjs verify --input evidence.json [--require-authentic] [--scenario name]'
    );
  const result = verifyDeploymentEvidence(readJson(options.input), {
    requireAuthentic: Boolean(options['require-authentic']),
    expectedScenario: options.scenario
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`deployment evidence verifier: ${error.message}`);
    process.exitCode = 1;
  }
}
