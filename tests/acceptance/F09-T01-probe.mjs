import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildDesiredState,
  canonicalize,
  parseDevelopmentTag,
  sha256Text,
  validateGitRef,
  validateReleaseEvent,
  verifyDesiredState
} from '../../scripts/release-publication.mjs';

const root = process.cwd();
const workflow = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
const cloudformation = JSON.parse(
  readFileSync(path.join(root, 'infrastructure/cloudformation/development.json'), 'utf8')
);

const rejects = (callback, message) => {
  assert.throws(callback, new RegExp(message));
};
const grepStatus = (args, input) => {
  const result = spawnSync('grep', args, { input, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  return result.status;
};

assert.deepEqual(parseDevelopmentTag('v1.2.3-dev.4').releaseOrder, [1, 2, 3, 4]);
for (const tag of [
  '1.2.3-dev.4',
  'v1.2.3',
  'v1.2-dev.4',
  'v1.2.3-dev',
  'v1.2.3-dev.-1',
  'v01.2.3-dev.4',
  'v1.2.3-dev.04',
  'v1.2.3-rc.1',
  'v1.2.3-dev.4/branch'
])
  rejects(() => parseDevelopmentTag(tag), 'invalid development semantic tag');

const validEvent = {
  eventName: 'push',
  refType: 'tag',
  ref: 'refs/tags/v1.2.3-dev.4',
  tag: 'v1.2.3-dev.4',
  environment: 'development',
  trusted: true,
  forceUpdated: false,
  gitSha: '0123456789abcdef0123456789abcdef01234567',
  tagCommit: '0123456789abcdef0123456789abcdef01234567',
  reachableFromDevelopment: true
};
assert.equal(validateReleaseEvent(validEvent).parsed.semanticVersion, '1.2.3-dev.4');
for (const [field, value, message] of [
  ['eventName', 'pull_request', 'push events only'],
  ['refType', 'branch', 'tag refs only'],
  ['ref', 'refs/heads/development', 'does not match'],
  ['environment', 'production', 'environment must be development'],
  ['trusted', false, 'untrusted event'],
  ['forceUpdated', true, 'force-updated'],
  ['gitSha', 'not-a-sha', '40-character lowercase'],
  ['tagCommit', 'fedcba9876543210fedcba9876543210fedcba98', 'does not resolve'],
  ['reachableFromDevelopment', false, 'not reachable'],
  ['previousTagSha', 'fedcba9876543210fedcba9876543210fedcba98', 'different Git SHA']
]) {
  rejects(() => validateReleaseEvent({ ...validEvent, [field]: value }), message);
}

const gitDir = mkdtempSync(path.join(os.tmpdir(), 'mmdc-f09-t01-git-'));
const git = (...args) => execFileSync('git', ['-C', gitDir, ...args], { encoding: 'utf8' }).trim();
git('init', '-b', 'development');
git('config', 'user.email', 'f09-t01@example.invalid');
git('config', 'user.name', 'F09-T01 harness');
writeFileSync(path.join(gitDir, 'release.txt'), 'reachable\n');
git('add', 'release.txt');
git('commit', '-m', 'reachable release fixture');
const reachableSha = git('rev-parse', 'HEAD');
git('tag', 'v1.2.3-dev.4', reachableSha);
assert.equal(validateGitRef({ gitDir, tag: 'v1.2.3-dev.4', gitSha: reachableSha }).parsed.tag, 'v1.2.3-dev.4');

git('checkout', '--orphan', 'unreachable');
writeFileSync(path.join(gitDir, 'release.txt'), 'unreachable\n');
git('add', 'release.txt');
git('commit', '-m', 'unreachable release fixture');
const unreachableSha = git('rev-parse', 'HEAD');
git('tag', 'v9.9.9-dev.1', unreachableSha);
git('checkout', 'development');
rejects(() => validateGitRef({ gitDir, tag: 'v9.9.9-dev.1', gitSha: unreachableSha }), 'not reachable');
rejects(
  () => validateGitRef({ gitDir, tag: 'v1.2.3-dev.4', gitSha: reachableSha, previousTagSha: unreachableSha }),
  'different Git SHA'
);

const evidence = {
  sbomSha256: 'a'.repeat(64),
  provenanceSha256: 'b'.repeat(64),
  publicationSha256: 'c'.repeat(64)
};
const stateInput = {
  repository: '123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/mmdc-v3-development',
  tag: 'v1.2.3-dev.4',
  gitSha: validEvent.gitSha,
  digest: `sha256:${'d'.repeat(64)}`,
  migrationVersion: '20260817_230000_media_governance',
  evidence,
  workflow: {
    eventName: 'push',
    ref: 'refs/tags/v1.2.3-dev.4',
    refType: 'tag',
    workflowRef: 'mmdcjpaul/mmdc-core/.github/workflows/release.yml@refs/heads/development',
    runId: '123456',
    actor: 'release-harness'
  },
  issuedAt: '2026-08-18T00:00:00.000Z'
};
const state = buildDesiredState(stateInput);
assert.equal(verifyDesiredState(state).idempotent, false);
assert.equal(verifyDesiredState(state, { previousState: state }).idempotent, true);
const tampered = structuredClone(state);
tampered.image.digest = `sha256:${'e'.repeat(64)}`;
rejects(() => verifyDesiredState(tampered), 'integrity check failed');
rejects(() => verifyDesiredState({ ...state, environment: 'production' }), 'wrong environment');
rejects(
  () => verifyDesiredState({ ...state, image: { ...state.image, repository: `${state.image.repository}:latest` } }),
  'mutable latest'
);
rejects(
  () => buildDesiredState({ ...stateInput, repository: '123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/latest' }),
  'mutable latest'
);
const olderState = buildDesiredState({
  ...stateInput,
  tag: 'v1.2.3-dev.3',
  workflow: { ...stateInput.workflow, ref: 'refs/tags/v1.2.3-dev.3' }
});
rejects(() => verifyDesiredState(olderState, { previousState: state }), 'replay older');
const conflictingState = buildDesiredState({
  ...stateInput,
  gitSha: 'fedcba9876543210fedcba9876543210fedcba98',
  digest: `sha256:${'f'.repeat(64)}`
});
rejects(() => verifyDesiredState(conflictingState, { previousState: state }), 'same monotonic');
rejects(() => buildDesiredState({ ...stateInput, digest: 'sha256:mutable' }), 'immutable sha256');
rejects(() => buildDesiredState({ ...stateInput, issuedAt: 'not-a-timestamp' }), 'ISO-8601');

const dryRunDir = mkdtempSync(path.join(os.tmpdir(), 'mmdc-f09-t01-dry-run-'));
const dryRunStateFile = path.join(dryRunDir, 'desired.json');
const dryRunSbomFile = path.join(dryRunDir, 'sbom.json');
const dryRunProvenanceFile = path.join(dryRunDir, 'provenance.json');
const dryRun = spawnSync(
  process.execPath,
  [
    'scripts/release-publication.mjs',
    'dry-run',
    '--output',
    dryRunStateFile,
    '--sbom-output',
    dryRunSbomFile,
    '--provenance-output',
    dryRunProvenanceFile
  ],
  { cwd: root, encoding: 'utf8' }
);
assert.equal(dryRun.status, 0, dryRun.stderr);
const dryRunOutput = JSON.parse(dryRun.stdout);
const dryRunState = JSON.parse(readFileSync(dryRunStateFile, 'utf8'));
assert.equal(verifyDesiredState(dryRunState).idempotent, false);
assert.equal(dryRunState.release.gitSha, dryRunState.image.gitShaTag.split(':').at(-1));
assert.equal(dryRunState.image.digest, dryRunOutput.state.image.digest);
assert.equal(dryRunState.evidence.sbomSha256, sha256Text(readFileSync(dryRunSbomFile, 'utf8')));
assert.equal(dryRunState.evidence.provenanceSha256, sha256Text(readFileSync(dryRunProvenanceFile, 'utf8')));
assert.equal(
  dryRunState.evidence.publicationSha256,
  sha256Text(
    canonicalize({
      gitSha: dryRunState.release.gitSha,
      tag: dryRunState.release.tag,
      digest: dryRunState.image.digest,
      repository: dryRunState.image.repository
    })
  )
);

assert.match(workflow, /push:\s*\n\s+tags:/);
assert.match(workflow, /v\*\.\*\.\*-dev\.\*/);
assert.match(workflow, /github\.event_name == 'push' && github\.ref_type == 'tag'/);
assert.match(workflow, /github\.event\.forced/);
assert.match(workflow, /test "\$GITHUB_EVENT_NAME" = push/);
assert.match(workflow, /test "\$GITHUB_REF_TYPE" = tag/);
assert.match(workflow, /test "\$GITHUB_REF" = "refs\/tags\/\$RELEASE_TAG"/);
assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/development/);
assert.match(workflow, /git tag --points-at "\$RELEASE_SHA" \| grep -Fx -- "\$RELEASE_TAG"/);
assert.match(workflow, /permissions:\s*\n\s+contents: read\s*\n\s+id-token: write/);
assert.match(workflow, /aws-actions\/configure-aws-credentials@v4/);
assert.match(workflow, /role-to-assume: \$\{\{ env\.AWS_ROLE_ARN \}\}/);
assert.match(workflow, /docker buildx build[\s\S]*--tag "\$ECR_REPOSITORY:\$GITHUB_SHA"[\s\S]*--push/);
assert.match(workflow, /--sbom=true/);
assert.match(workflow, /--provenance=mode=max/);
assert.match(workflow, /aws ecr describe-images[\s\S]*imageTag="\$GITHUB_SHA"/);
assert.match(workflow, /Reject a reused semantic ECR tag[\s\S]*imageTag="\$RELEASE_TAG"/);
assert.match(workflow, /docker buildx imagetools create[\s\S]*\$ECR_REPOSITORY:\$RELEASE_TAG[\s\S]*@\$digest/);
assert.match(workflow, /aws s3 cp[\s\S]*desired\.json/);
assert.match(workflow, /issued_at="\$\(git show -s --format=%cI "\$GITHUB_SHA"\)"/);
assert.match(workflow, /printf '%s\\n' "\$digest" \| grep -E '\^sha256:\[0-9a-f\]\{64\}\$'/);
assert.match(workflow, /issued_at[\s\S]*grep -Eq '\^20\[0-9\]\{2\}/);
assert.match(workflow, /for command in git grep node; do\s+command -v "\$command" >\/dev\/null 2>&1\s+done/);
assert.match(workflow, /for command in aws docker git grep node; do\s+command -v "\$command" >\/dev\/null 2>&1\s+done/);
assert.doesNotMatch(workflow, /(^|[|;&()\s])rg(?:[|;&()\s]|$)/m);
assert.equal(grepStatus(['-Fx', '--', 'v1.2.3-dev.4'], 'v1.2.3-dev.4\n'), 0);
assert.equal(grepStatus(['-Fx', '--', 'v1.2.3-dev.4'], 'v1.2.3-dev.40\n'), 1);
assert.equal(grepStatus(['-E', '^sha256:[0-9a-f]{64}$'], `sha256:${'a'.repeat(64)}\n`), 0);
assert.equal(grepStatus(['-E', '^sha256:[0-9a-f]{64}$'], `sha256:${'a'.repeat(64)}extra\n`), 1);
const timestampPattern =
  '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$';
assert.equal(grepStatus(['-E', timestampPattern], '2026-08-18T11:12:29Z\n'), 0);
assert.equal(grepStatus(['-E', timestampPattern], '2026-08-18 11:12:29Z\n'), 1);
assert.equal(
  spawnSync('bash', ['-c', 'for command in git grep node; do command -v "$command" >/dev/null 2>&1; done']).status,
  0
);
assert.notEqual(
  spawnSync('bash', [
    '-c',
    'for command in git mmdc-unavailable-command; do command -v "$command" >/dev/null 2>&1; done'
  ]).status,
  0
);
assert.doesNotMatch(workflow, /github\.event\.head_commit\.timestamp/);
assert.doesNotMatch(workflow, /latest/);
assert.doesNotMatch(workflow, /AWS_(?:ACCESS|SECRET|SESSION)_KEY|secrets\./);
assert.doesNotMatch(workflow, /ssh\s+-|scp\s+/);
assert.match(workflow, /retention-days: 14/);

const ecr = cloudformation.Resources.ApplicationRepository;
assert.equal(ecr.Properties.ImageTagMutability, 'IMMUTABLE');
assert.equal(ecr.Properties.ImageScanningConfiguration.ScanOnPush, true);
assert.match(ecr.Properties.LifecyclePolicy.LifecyclePolicyText, /imageCountMoreThan/);
const role = cloudformation.Resources.GitHubDevelopmentDeployRole;
const trust = role.Properties.AssumeRolePolicyDocument.Statement[0];
assert.equal(trust.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
// The publish job declares `environment: development`, so GitHub emits the
// environment-scoped subject. The development-tag restriction is enforced
// through `job_workflow_ref`, which a tag run pins to `refs/tags/<tag>`.
assert.match(
  trust.Condition.StringEquals['token.actions.githubusercontent.com:sub']['Fn::Sub'],
  /^repo:\$\{GitHubRepository\}:environment:\$\{EnvironmentName\}$/
);
assert.match(
  cloudformation.Parameters.GitHubWorkflowRef.Default,
  /\/\.github\/workflows\/release\.yml@refs\/tags\/v\*\.\*\.\*-dev\.\*$/
);
assert.match(cloudformation.Parameters.GitHubWorkflowRef.AllowedPattern, /refs\/tags\/v\\\*/);
assert.equal(role.Properties.MaxSessionDuration, 3600);
const publisherStatements = role.Properties.Policies.flatMap(({ PolicyDocument }) => PolicyDocument.Statement);
assert.ok(publisherStatements.some(({ Sid }) => Sid === 'WriteOnlyDevelopmentDesiredState'));
assert.equal(
  publisherStatements.some(({ Action }) => (Array.isArray(Action) ? Action : [Action]).includes('*')),
  false
);
assert.doesNotMatch(JSON.stringify(cloudformation), /latest/i);

console.log(
  'F09-T01 probe passed semantic tag/ref/ancestry/reuse gates, immutable SHA-to-digest dry-run, SBOM/provenance binding, desired-state integrity/replay checks, OIDC workflow policy, ECR immutability, and negative security cases'
);
