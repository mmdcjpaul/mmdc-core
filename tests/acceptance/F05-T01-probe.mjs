import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketVersioningCommand,
  S3Client
} from '@aws-sdk/client-s3';

import { mediaObjectKey } from '../../src/media-storage.ts';

const mode = process.argv[2];
const bucket = process.env.MMDC_MEDIA_BUCKET;
const endpoint = process.env.MMDC_MEDIA_ENDPOINT;
const region = process.env.MMDC_MEDIA_REGION;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

const assertIncludes = (value, fragment, message) => assert.ok(value.includes(fragment), message);

if (mode === 'policy') {
  const policy = JSON.parse(readFileSync('infrastructure/s3/application-policy.json', 'utf8'));
  const statement = policy.Statement.find(({ Sid }) => Sid === 'MediaObjectOperationsOnly');
  assert.ok(statement, 'application media policy statement is present');
  assert.deepEqual(
    statement.Action,
    ['s3:AbortMultipartUpload', 's3:DeleteObject', 's3:GetObject', 's3:ListMultipartUploadParts', 's3:PutObject'],
    'application policy has only required object actions'
  );
  assert.equal(statement.Resource, 'arn:aws:s3:::${MMDC_MEDIA_BUCKET}/media/*');
  assert.equal(statement.Effect, 'Allow');
  assert.doesNotMatch(
    JSON.stringify(policy),
    /PutBucketPolicy|PutBucketEncryption|PutBucketLifecycleConfiguration|ListAllMyBuckets/
  );

  const template = readFileSync('infrastructure/s3/media-bucket.yaml', 'utf8');
  for (const required of [
    'BucketEncryption:',
    'SSEAlgorithm: AES256',
    'VersioningConfiguration:',
    'Status: Enabled',
    'BlockPublicAcls: true',
    'BlockPublicPolicy: true',
    'IgnorePublicAcls: true',
    'RestrictPublicBuckets: true',
    'AbortIncompleteMultipartUploads',
    'ExpireNoncurrentVersions',
    'NoncurrentDays: 30',
    'DenyInsecureTransport',
    'MediaObjectOperationsOnly',
    "Resource: !Sub '${MediaBucket.Arn}/${MediaPrefix}/*'"
  ]) {
    assertIncludes(template, required, `CloudFormation media policy is missing ${required}`);
  }
  assert.match(template, /DeletionPolicy: Retain/);
  assert.match(template, /UpdateReplacePolicy: Retain/);
  const bucketPolicySection = template.slice(
    template.indexOf('MediaBucketPolicy'),
    template.indexOf('MediaApplicationPolicy')
  );
  assert.doesNotMatch(bucketPolicySection, /Effect:\s*Allow/);
  assert.doesNotMatch(template, /CloudFront|OriginAccessControl|OriginAccessIdentity/);

  const allowed = (action, resource) =>
    statement.Action.includes(action) && resource.startsWith('arn:aws:s3:::bucket/media/');
  assert.equal(allowed('s3:PutObject', 'arn:aws:s3:::bucket/media/record-a/file.png'), true);
  assert.equal(allowed('s3:GetObject', 'arn:aws:s3:::bucket/media/record-a/file.png'), true);
  assert.equal(allowed('s3:DeleteObject', 'arn:aws:s3:::bucket/media/record-a/file.png'), true);
  assert.equal(allowed('s3:ListBucket', 'arn:aws:s3:::bucket'), false);
  assert.equal(allowed('s3:PutBucketPolicy', 'arn:aws:s3:::bucket'), false);
  assert.equal(allowed('s3:PutObject', 'arn:aws:s3:::bucket/other/file.png'), false);
  assert.equal(allowed('s3:GetObject', 'arn:aws:s3:::other-bucket/media/file.png'), false);
  console.log('F05-T01 policy probe: private bucket controls, lifecycle, and prefix-scoped least privilege passed');
  process.exit(0);
}

if (mode === 'selection-local') {
  const { default: config } = await import('../../payload.config.ts');
  const { Media } = await import('../../src/collections/Media.ts');
  const { getPayload } = await import('payload');
  assert.equal(process.env.MMDC_MEDIA_STORAGE, 'local');
  assert.equal(config.plugins?.length ?? 0, 0, 'local defaults do not install an S3 adapter');
  assert.equal(Media.upload?.disableLocalStorage, undefined, 'local media keeps filesystem storage enabled');
  assert.ok(process.env.MMDC_MEDIA_DIR, 'local media directory is explicit for the probe');
  const payload = await getPayload({ config });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwAAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64'
  );
  await payload.create({
    collection: 'media',
    data: {
      alt: 'F05-T01 local filesystem probe',
      rightsStatus: 'owned',
      rightsHolder: 'MMDC foundation probe'
    },
    file: { data: png, mimetype: 'image/png', name: 'local-foundation.png', size: png.length },
    overrideAccess: true,
    overwriteExistingFiles: true
  });
  assert.equal(existsSync(path.join(process.env.MMDC_MEDIA_DIR, 'local-foundation.png')), true);
  assert.deepEqual(readFileSync(path.join(process.env.MMDC_MEDIA_DIR, 'local-foundation.png')), png);
  await payload.destroy();
  console.log('F05-T01 local adapter probe: local filesystem selected without AWS credentials');
  process.exit(0);
}

if (!['create', 'verify'].includes(mode))
  throw new Error('usage: F05-T01-probe.mjs policy|selection-local|create|verify');
for (const [name, value] of Object.entries({ bucket, endpoint, region, accessKeyId, secretAccessKey })) {
  assert.ok(value, `${name} is required for the disposable S3 probe`);
}

const s3 = new S3Client({
  credentials: { accessKeyId, secretAccessKey },
  endpoint,
  forcePathStyle: true,
  region
});

const assertObjectBytes = async (key, expected) => {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  assert.ok(object.Body, `S3 object ${key} has a body`);
  assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()), expected);
};

if (mode === 'create') {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));

  const anonymousList = await fetch(`${endpoint}/${bucket}?list-type=2`);
  assert.equal(anonymousList.ok, false, 'public bucket listing is denied');
  const anonymousWrite = await fetch(`${endpoint}/${bucket}/public-write-denied.txt`, {
    body: 'must be denied',
    method: 'PUT'
  });
  assert.equal(anonymousWrite.ok, false, 'public object write is denied');

  const { default: config } = await import('../../payload.config.ts');
  const { getPayload } = await import('payload');
  const payload = await getPayload({ config });
  const hostedMedia = payload.config.collections.find(({ slug }) => slug === 'media');
  assert.equal(hostedMedia?.upload?.disableLocalStorage, true, 'hosted media uses the S3 adapter');
  assert.equal(
    hostedMedia?.fields.some((field) => 'name' in field && field.name === 'prefix'),
    true,
    'hosted media persists the storage prefix'
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwAAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64'
  );
  const media = await payload.create({
    collection: 'media',
    data: {
      alt: 'F05-T01 persistence probe',
      rightsStatus: 'owned',
      rightsHolder: 'MMDC foundation probe'
    },
    file: { data: png, mimetype: 'image/png', name: 'foundation.png', size: png.length },
    overrideAccess: true,
    overwriteExistingFiles: true
  });
  assert.match(String(media.prefix), /^record-[0-9a-f-]{36}$/);
  const key = mediaObjectKey(String(media.prefix), 'foundation.png');
  assert.equal(key, `media/${media.prefix}/foundation.png`);
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  await assertObjectBytes(key, png);

  const sameRecordOriginal = mediaObjectKey(String(media.prefix), 'foundation.png');
  const sameRecordVariant = mediaObjectKey(String(media.prefix), 'foundation-thumbnail.png');
  const otherRecord = mediaObjectKey('record-00000000-0000-0000-0000-000000000000', 'foundation.png');
  assert.equal(sameRecordOriginal, mediaObjectKey(String(media.prefix), 'foundation.png'));
  assert.notEqual(sameRecordOriginal, sameRecordVariant, 'variants have distinct stable keys');
  assert.notEqual(sameRecordOriginal, otherRecord, 'records cannot collide on the same filename');
  assert.doesNotMatch(key, /F05-T01|secret|password/i, 'object key does not expose secret input');
  await payload.destroy();
  console.log(JSON.stringify({ key, mediaId: media.id }));
} else {
  const { default: config } = await import('../../payload.config.ts');
  const { getPayload } = await import('payload');
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'media',
    limit: 1,
    overrideAccess: true,
    where: { alt: { equals: 'F05-T01 persistence probe' } }
  });
  assert.equal(result.totalDocs, 1, 'media metadata survived application replacement');
  const media = result.docs[0];
  const key = mediaObjectKey(String(media.prefix), String(media.filename));
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  await assertObjectBytes(
    key,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwAAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64'
    )
  );
  await payload.delete({ collection: 'media', id: media.id, overrideAccess: true });
  await assert.rejects(() => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })), /NotFound|NoSuchKey|404/);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'public-write-denied.txt' }));
  await payload.destroy();
  console.log(JSON.stringify({ key, persisted: true, recoverableDelete: true }));
}
