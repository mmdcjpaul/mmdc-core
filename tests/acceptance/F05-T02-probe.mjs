import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  ListObjectVersionsCommand,
  S3Client,
  HeadObjectCommand,
  PutBucketVersioningCommand,
  CreateBucketCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { getPayload } from 'payload';
import config from '../../payload.config.ts';
import {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_BYTES,
  recoverMediaObjectVersion,
  validateMediaUpload
} from '../../src/media-governance.ts';
import { deliverMedia } from '../../src/media-delivery.ts';
import { mediaObjectKey } from '../../src/media-storage.ts';

const mode = process.argv[2];
const password = 'F05-T02-test-only-password-123!';
const email = 'f05-t02-editor@example.test';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwAAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

const fileFor = (data, name = 'governed.png', mimetype = 'image/png') => ({ data, name, mimetype, size: data.length });
const governedData = (alt = 'A governed red image') => ({
  alt,
  rightsHolder: 'MMDC test rights holder',
  rightsStatus: 'owned'
});

const expectRejected = async (label, operation) => {
  await assert.rejects(operation, undefined, `${label} must be rejected`);
};

if (mode === 'validation') {
  assert.deepEqual(ALLOWED_MEDIA_TYPES, ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const valid = await validateMediaUpload({
    data: governedData(),
    file: fileFor(png, 'not-an-image.exe', 'application/x-msdownload')
  });
  assert.equal(valid.detectedMimeType, 'image/png', 'server uses byte signature, not browser MIME or extension');
  assert.equal(valid.actualSize, png.length);
  assert.equal(valid.contentHash, createHash('sha256').update(png).digest('hex'));

  await expectRejected('invalid type/signature', () =>
    validateMediaUpload({
      data: governedData(),
      file: fileFor(Buffer.from('<html>not media</html>'), 'photo.png', 'image/png')
    })
  );
  await expectRejected('oversize content', () =>
    validateMediaUpload({
      data: governedData(),
      file: fileFor(Buffer.concat([png, Buffer.alloc(MAX_MEDIA_BYTES + 1 - png.length)]))
    })
  );
  await expectRejected('missing rights status', () =>
    validateMediaUpload({ data: { alt: 'image', rightsHolder: 'holder' }, file: fileFor(png) })
  );
  await expectRejected('missing rights holder', () =>
    validateMediaUpload({ data: { alt: 'image', rightsStatus: 'owned' }, file: fileFor(png) })
  );
  await expectRejected('missing accessibility metadata', () =>
    validateMediaUpload({ data: { rightsStatus: 'owned', rightsHolder: 'holder' }, file: fileFor(png) })
  );
  console.log(
    'F05-T02 validation probe: authoritative type, size, signature, rights, accessibility, and anti-spoof checks passed'
  );
  process.exit(0);
}

const payload = await getPayload({ config });
const stop = async (code = 0) => {
  await payload.destroy();
  process.exit(code);
};
const ensureUser = async () => {
  const existing = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: email } }
  });
  if (existing.docs[0]) return existing.docs[0];
  return payload.create({ collection: 'users', data: { email, password, role: 'editor' }, overrideAccess: true });
};
const image = async () =>
  sharp({ create: { background: { b: 70, g: 40, r: 210 }, channels: 3, height: 220, width: 320 } })
    .png()
    .toBuffer();
const fakeRequest = (user, url) => ({
  headers: new Headers(),
  payload,
  req: undefined,
  url,
  user
});

if (mode === 'local-create') {
  const user = await ensureUser();
  const source = await image();
  const media = await payload.create({
    collection: 'media',
    data: governedData(),
    file: fileFor(source),
    overrideAccess: false,
    overwriteExistingFiles: true,
    user
  });
  assert.equal(media.eligibilityStatus, 'eligible');
  assert.equal(media.storageState, 'ready');
  assert.equal(media.detectedMimeType, 'image/png');
  assert.equal(media.contentHash, createHash('sha256').update(source).digest('hex'));
  assert.match(String(media.canonicalKey), /^media\/record-[0-9a-f-]{36}\/governed\.png$/);
  assert.ok(Object.keys(media.variantManifest || {}).length > 0, 'resize variants have canonical manifests');
  const mediaDir = process.env.MMDC_MEDIA_DIR;
  assert.ok(mediaDir && existsSync(`${mediaDir}/governed.png`), 'local source bytes persist');

  const read = await payload.findByID({ collection: 'media', id: media.id, overrideAccess: false, user });
  assert.equal(read.contentHash, media.contentHash, 'metadata read returns canonical governance fields');
  await assert.rejects(() => payload.findByID({ collection: 'media', id: media.id, overrideAccess: false }));
  const unauthorized = await deliverMedia(fakeRequest(null, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(unauthorized.status, 401);
  const authorized = await deliverMedia(fakeRequest(user, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(authorized.status, 200);
  assert.deepEqual(Buffer.from(await authorized.arrayBuffer()), source);
  console.log(
    JSON.stringify({ mediaId: media.id, prefix: media.prefix, variants: Object.keys(media.variantManifest || {}) })
  );
  await stop();
}

if (mode === 'local-restart') {
  const user = await ensureUser();
  const result = await payload.find({
    collection: 'media',
    limit: 1,
    overrideAccess: true,
    where: { alt: { equals: 'A governed red image' } }
  });
  assert.equal(result.totalDocs, 1, 'Payload metadata survives a replacement process');
  const media = result.docs[0];
  const response = await deliverMedia(fakeRequest(user, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(response.status, 200, 'delivery survives restart');
  console.log('F05-T02 local restart probe: metadata, bytes, authorized delivery, and unauthorized denial passed');
  await stop();
}

const bucket = process.env.MMDC_MEDIA_BUCKET;
const endpoint = process.env.MMDC_MEDIA_ENDPOINT;
const region = process.env.MMDC_MEDIA_REGION;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const s3 = new S3Client({ credentials: { accessKeyId, secretAccessKey }, endpoint, forcePathStyle: true, region });

if (mode === 's3-create') {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
  const user = await ensureUser();
  const source = await image();
  const media = await payload.create({
    collection: 'media',
    data: governedData(),
    file: fileFor(source),
    overrideAccess: false,
    overwriteExistingFiles: true,
    user
  });
  const sourceKey = mediaObjectKey(String(media.prefix), String(media.filename));
  assert.equal(media.eligibilityStatus, 'eligible');
  assert.equal(media.storageState, 'ready');
  assert.equal(media.canonicalKey, sourceKey);
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
  for (const variant of Object.values(media.variantManifest || {})) {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: variant.objectKey }));
  }
  const unauthorized = await deliverMedia(fakeRequest(null, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(unauthorized.status, 401);
  const authorized = await deliverMedia(fakeRequest(user, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(authorized.status, 200);
  assert.deepEqual(Buffer.from(await authorized.arrayBuffer()), source);
  console.log(JSON.stringify({ mediaId: media.id, prefix: media.prefix, sourceKey, variants: media.variantManifest }));
  await stop();
}

if (mode === 's3-verify') {
  const user = await ensureUser();
  const result = await payload.find({
    collection: 'media',
    limit: 1,
    overrideAccess: true,
    where: { alt: { equals: 'A governed red image' } }
  });
  assert.equal(result.totalDocs, 1, 'S3 metadata survives a replacement process');
  const media = result.docs[0];
  const sourceKey = mediaObjectKey(String(media.prefix), String(media.filename));
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
  const variantName = Object.keys(media.variantManifest || {})[0];
  assert.ok(variantName, 'a deterministic resize variant exists');
  const variant = media.variantManifest[variantName];
  const variantResponse = await deliverMedia(
    fakeRequest(user, `http://mmdc.test/api/media-delivery/${media.id}?file=${encodeURIComponent(variant.filename)}`)
  );
  assert.equal(variantResponse.status, 200, 'authorized variant delivery succeeds');
  assert.ok((await variantResponse.arrayBuffer()).byteLength > 0);
  const prefix = String(media.prefix);
  await payload.delete({ collection: 'media', id: media.id, overrideAccess: true });
  const versions = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: sourceKey }));
  const previous = (versions.Versions || []).find(
    (entry) => entry.Key === sourceKey && entry.VersionId && entry.IsLatest === false
  );
  assert.ok(previous?.VersionId, 'versioned deletion leaves a recoverable source version');
  await recoverMediaObjectVersion({
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle: true,
    key: sourceKey,
    region,
    secretAccessKey,
    versionId: previous.VersionId
  });
  const recovered = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
  assert.ok(recovered.VersionId, 'recovered object has a new current version');
  console.log(JSON.stringify({ deletedPrefix: prefix, sourceKey, recoveredVersion: recovered.VersionId }));
  await stop();
}

if (mode === 's3-outage') {
  const user = await ensureUser();
  const source = await image();
  const alertFile = process.env.MMDC_MEDIA_ALERT_FILE;
  assert.ok(alertFile);
  const before = await payload.find({
    collection: 'media',
    limit: 0,
    overrideAccess: true,
    where: { alt: { equals: 'outage probe' } }
  });
  const media = await payload.create({
    collection: 'media',
    data: { ...governedData('outage probe'), alt: 'outage probe' },
    file: fileFor(source),
    overrideAccess: false,
    overwriteExistingFiles: true,
    user
  });
  assert.equal(media.storageState, 'unavailable');
  assert.equal(media.eligibilityStatus, 'ineligible');
  const after = await payload.find({
    collection: 'media',
    limit: 0,
    overrideAccess: true,
    where: { alt: { equals: 'outage probe' } }
  });
  assert.equal(after.totalDocs, before.totalDocs + 1, 'Payload metadata is preserved during S3 outage');
  const fallback = await deliverMedia(fakeRequest(user, `http://mmdc.test/api/media-delivery/${media.id}`));
  assert.equal(fallback.status, 503);
  const fallbackText = await fallback.text();
  assert.match(fallbackText, /media-unavailable/);
  assert.doesNotMatch(fallbackText, /https?:\/\/|s3\.amazonaws\.com|X-Amz-|AWS_SECRET|S3_SECRET/);
  assert.match(readFileSync(alertFile, 'utf8'), /media-storage-unavailable/);
  console.log('F05-T02 outage probe: metadata preservation, governed fallback, alert, and ineligibility passed');
  await stop();
}

throw new Error('usage: validation|local-create|local-restart|s3-create|s3-verify|s3-outage');
