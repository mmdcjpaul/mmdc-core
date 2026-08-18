#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const DEVELOPMENT_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-dev\.(0|[1-9]\d*)$/;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const sha256Text = (value) => createHash('sha256').update(value).digest('hex');
export const sha256File = (file) => sha256Text(readFileSync(file));

export const parseDevelopmentTag = (tag) => {
  const match = DEVELOPMENT_TAG.exec(String(tag));
  if (!match) throw new Error(`invalid development semantic tag: ${tag}`);
  const [, major, minor, patch, dev] = match;
  return {
    tag,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    dev: Number(dev),
    semanticVersion: `${major}.${minor}.${patch}-dev.${dev}`,
    releaseOrder: [Number(major), Number(minor), Number(patch), Number(dev)]
  };
};

const compareOrder = (left, right) => {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const assertSha = (value, label) => {
  if (!SHA.test(value)) throw new Error(`${label} must be a 40-character lowercase Git SHA`);
};

const assertDigest = (value, label) => {
  if (!DIGEST.test(value)) throw new Error(`${label} must be an immutable sha256 digest`);
};

const assertHash = (value, label) => {
  if (!HASH.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hex value`);
};

const rejectMutableReferences = (value) => {
  const serialized = JSON.stringify(value);
  if (/(^|[^a-z])latest([^a-z]|$)/i.test(serialized)) throw new Error('mutable latest references are prohibited');
};

export const validateReleaseEvent = (event) => {
  const errors = [];
  const tag = event?.tag ?? event?.ref?.replace(/^refs\/tags\//, '');
  const expectedRef = tag ? `refs/tags/${tag}` : '';
  if (event?.eventName !== 'push') errors.push('release publication accepts push events only');
  if (event?.refType !== 'tag') errors.push('release publication accepts tag refs only');
  if (event?.ref !== expectedRef) errors.push('event ref does not match the semantic tag');
  if (event?.environment !== 'development') errors.push('release environment must be development');
  if (event?.trusted === false) errors.push('untrusted event cannot publish');
  if (event?.forceUpdated === true) errors.push('force-updated or moved tags cannot publish');
  try {
    parseDevelopmentTag(tag);
  } catch (error) {
    errors.push(error.message);
  }
  try {
    assertSha(event?.gitSha, 'gitSha');
  } catch (error) {
    errors.push(error.message);
  }
  if (event?.tagCommit && event.tagCommit !== event.gitSha) errors.push('tag does not resolve to the event Git SHA');
  if (event?.reachableFromDevelopment !== true) errors.push('tag commit is not reachable from the development branch');
  if (event?.previousTagSha && event.previousTagSha !== event.gitSha)
    errors.push('semantic tag already exists at a different Git SHA');
  if (errors.length) throw new Error(errors.join('; '));
  return { ...event, tag, ref: expectedRef, parsed: parseDevelopmentTag(tag) };
};

export const validateGitRef = ({ gitDir, tag, gitSha, developmentRef = 'development', previousTagSha }) => {
  const resolvedTag = `refs/tags/${tag}`;
  const tagCommit = execFileSync('git', ['-C', gitDir, 'rev-parse', '--verify', `${resolvedTag}^{commit}`], {
    encoding: 'utf8'
  }).trim();
  const ancestry = spawnSync('git', ['-C', gitDir, 'merge-base', '--is-ancestor', gitSha, developmentRef], {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  return validateReleaseEvent({
    eventName: 'push',
    refType: 'tag',
    ref: resolvedTag,
    tag,
    environment: 'development',
    trusted: true,
    forceUpdated: false,
    gitSha,
    tagCommit,
    reachableFromDevelopment: ancestry.status === 0,
    previousTagSha
  });
};

const unsignedState = (state) => {
  const { integrity: _integrity, ...unsigned } = state;
  return unsigned;
};

export const buildDesiredState = ({
  environment = 'development',
  repository,
  tag,
  gitSha,
  digest,
  migrationVersion,
  compatibility = 'compatible',
  migrationCommand = 'pnpm run migrate:apply',
  evidence,
  workflow,
  issuedAt = '1970-01-01T00:00:00.000Z'
}) => {
  const parsed = parseDevelopmentTag(tag);
  if (environment !== 'development') throw new Error('desired state environment must be development');
  assertSha(gitSha, 'gitSha');
  assertDigest(digest, 'image digest');
  if (!/^[A-Za-z0-9._/-]+$/.test(repository) || repository.includes(':') || repository.includes('@'))
    throw new Error('image repository must be a tag-free repository URI');
  if (!migrationVersion || !/^[A-Za-z0-9._-]+$/.test(migrationVersion))
    throw new Error('migration version is required and must be stable');
  if (!['compatible', 'incompatible'].includes(compatibility))
    throw new Error('migration compatibility must be compatible or incompatible');
  if (migrationCommand !== 'pnpm run migrate:apply') throw new Error('migration command is not approved');
  if (typeof issuedAt !== 'string' || !ISO_8601.test(issuedAt))
    throw new Error('issuedAt must be a validated ISO-8601 commit timestamp');
  for (const key of ['sbomSha256', 'provenanceSha256', 'publicationSha256'])
    assertHash(evidence?.[key], `evidence.${key}`);
  if (!workflow || workflow.eventName !== 'push' || workflow.refType !== 'tag')
    throw new Error('desired state must identify a trusted tag workflow');
  const state = {
    schemaVersion: 1,
    environment,
    monotonic: { releaseOrder: parsed.releaseOrder, value: parsed.releaseOrder.join('.') },
    release: {
      tag,
      semanticVersion: parsed.semanticVersion,
      gitSha,
      migrationVersion
    },
    image: {
      repository,
      gitShaTag: `${repository}:${gitSha}`,
      digest
    },
    migration: { command: migrationCommand, version: migrationVersion, compatibility },
    evidence: { ...evidence },
    workflow: {
      eventName: workflow.eventName,
      ref: workflow.ref,
      refType: workflow.refType,
      workflowRef: workflow.workflowRef,
      runId: workflow.runId,
      actor: workflow.actor
    },
    issuedAt
  };
  rejectMutableReferences(state);
  return {
    ...state,
    integrity: { algorithm: 'sha256', canonicalSha256: sha256Text(canonicalize(state)) }
  };
};

export const verifyDesiredState = (state, { expectedEnvironment = 'development', previousState } = {}) => {
  if (!state || state.schemaVersion !== 1) throw new Error('unsupported desired-state schema');
  if (state.environment !== expectedEnvironment) throw new Error('desired state targets the wrong environment');
  if (typeof state.issuedAt !== 'string' || !ISO_8601.test(state.issuedAt))
    throw new Error('desired state issuedAt is not a validated ISO-8601 timestamp');
  rejectMutableReferences(state);
  const parsed = parseDevelopmentTag(state.release?.tag);
  assertSha(state.release?.gitSha, 'release.gitSha');
  assertDigest(state.image?.digest, 'image.digest');
  if (state.image?.gitShaTag !== `${state.image.repository}:${state.release.gitSha}`)
    throw new Error('Git-SHA image tag is not bound to the release SHA');
  if (!state.image.repository || state.image.repository.includes(':') || state.image.repository.includes('@'))
    throw new Error('desired state contains a mutable image reference');
  if (state.release.semanticVersion !== parsed.semanticVersion) throw new Error('semantic tag mapping is inconsistent');
  if (JSON.stringify(state.monotonic?.releaseOrder) !== JSON.stringify(parsed.releaseOrder))
    throw new Error('monotonic release order is inconsistent');
  if (state.monotonic?.value !== parsed.releaseOrder.join('.'))
    throw new Error('monotonic release value is inconsistent');
  if (
    state.migration?.command !== 'pnpm run migrate:apply' ||
    !state.migration?.version ||
    !['compatible', 'incompatible'].includes(state.migration?.compatibility)
  )
    throw new Error('desired state migration contract is incomplete');
  if (state.migration.version !== state.release.migrationVersion)
    throw new Error('desired state migration version is inconsistent');
  for (const key of ['sbomSha256', 'provenanceSha256', 'publicationSha256'])
    assertHash(state.evidence?.[key], `evidence.${key}`);
  if (!state.integrity || state.integrity.algorithm !== 'sha256') throw new Error('desired state integrity is missing');
  const expectedHash = sha256Text(canonicalize(unsignedState(state)));
  if (state.integrity.canonicalSha256 !== expectedHash) throw new Error('desired state integrity check failed');
  if (state.workflow?.eventName !== 'push' || state.workflow?.refType !== 'tag')
    throw new Error('desired state workflow identity is not a tag push');
  if (!state.workflow.ref || !state.workflow.workflowRef || !state.workflow.runId || !state.workflow.actor)
    throw new Error('desired state workflow identity is incomplete');
  if (!previousState) return { idempotent: false, releaseOrder: parsed.releaseOrder };
  const previous = verifyDesiredState(previousState, { expectedEnvironment });
  const comparison = compareOrder(parsed.releaseOrder, previous.releaseOrder);
  if (comparison < 0) throw new Error('desired state is a replay older than the active release');
  if (comparison === 0) {
    if (canonicalize(state) !== canonicalize(previousState))
      throw new Error('same monotonic release value has different desired state');
    return { idempotent: true, releaseOrder: parsed.releaseOrder };
  }
  return { idempotent: false, releaseOrder: parsed.releaseOrder };
};

const parseOptions = (args) => {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) continue;
    const key = argument.slice(2);
    options[key] = args[index + 1]?.startsWith('--') ? true : args[++index];
  }
  return options;
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const dryRun = (options) => {
  const gitSha = '0123456789abcdef0123456789abcdef01234567';
  const tag = 'v1.2.3-dev.4';
  const repository = 'dry-run.invalid/mmdc-v3-development';
  const digest = `sha256:${sha256Text(`${repository}:${gitSha}:image`)}`;
  const sbom = `${JSON.stringify({ format: 'spdx-json', artifact: `${repository}@${digest}`, gitSha }, null, 2)}\n`;
  const provenance = `${JSON.stringify({ builder: 'local-dry-run', subject: `${repository}@${digest}`, gitSha }, null, 2)}\n`;
  const evidence = {
    sbomSha256: sha256Text(sbom),
    provenanceSha256: sha256Text(provenance),
    publicationSha256: sha256Text(canonicalize({ gitSha, tag, digest, repository }))
  };
  const state = buildDesiredState({
    repository,
    tag,
    gitSha,
    digest,
    migrationVersion: '20260817_230000_media_governance',
    evidence,
    workflow: {
      eventName: 'push',
      ref: `refs/tags/${tag}`,
      refType: 'tag',
      workflowRef: 'mmdcjpaul/mmdc-core/.github/workflows/release.yml@refs/heads/development',
      runId: 'dry-run-0001',
      actor: 'local-harness'
    }
  });
  const output = { mode: 'publication-dry-run', state, sbom, provenance };
  if (options.output) writeFileSync(options.output, `${JSON.stringify(state, null, 2)}\n`);
  if (options['sbom-output']) writeFileSync(options['sbom-output'], sbom);
  if (options['provenance-output']) writeFileSync(options['provenance-output'], provenance);
  console.log(JSON.stringify(output, null, 2));
};

const main = () => {
  const [action, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (action === 'validate-event') {
    console.log(JSON.stringify(validateReleaseEvent(readJson(options.input)), null, 2));
    return;
  }
  if (action === 'verify-desired') {
    const result = verifyDesiredState(
      readJson(options.input),
      options.previous ? { previousState: readJson(options.previous) } : {}
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === 'dry-run') {
    dryRun(options);
    return;
  }
  if (action === 'publish-state') {
    const sbomSha256 = sha256File(options.sbom);
    const provenanceSha256 = sha256File(options.provenance);
    const publicationSha256 = sha256Text(
      canonicalize({
        gitSha: options['git-sha'],
        tag: options.tag,
        digest: options.digest,
        repository: options.repository
      })
    );
    const state = buildDesiredState({
      repository: options.repository,
      tag: options.tag,
      gitSha: options['git-sha'],
      digest: options.digest,
      migrationVersion: options['migration-version'],
      evidence: { sbomSha256, provenanceSha256, publicationSha256 },
      workflow: {
        eventName: 'push',
        ref: `refs/tags/${options.tag}`,
        refType: 'tag',
        workflowRef: options['workflow-ref'],
        runId: options['run-id'],
        actor: options.actor
      },
      issuedAt: options['issued-at']
    });
    writeFileSync(options.output, `${JSON.stringify(state, null, 2)}\n`);
    console.log(JSON.stringify({ stateFile: options.output, ...state.integrity }, null, 2));
    return;
  }
  throw new Error(
    'Usage: release-publication.mjs <validate-event|verify-desired|dry-run|publish-state> [--input file] [--output file]'
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`release publication: ${error.message}`);
    process.exitCode = 1;
  }
}
