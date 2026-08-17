import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

import {
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, PayloadRequest } from 'payload';
import { APIError } from 'payload';

import { loadEnvironment } from './environment.ts';
import { mediaDeliveryPath, mediaObjectKey } from './media-storage.ts';

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MEDIA_TYPES = ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

type UploadFile = NonNullable<PayloadRequest['file']>;
type MediaData = Record<string, any>;
type MediaUploadContext = {
  source: Buffer;
  variants: Record<string, Buffer>;
  detectedMimeType: string;
  contentHash: string;
};

const asContext = (req: PayloadRequest): Record<string, any> => {
  req.context = req.context || {};
  return req.context as Record<string, any>;
};

const hasBytes = (bytes: Buffer, offset: number, ...values: number[]): boolean =>
  values.every((value, index) => bytes[offset + index] === value);

const detectMimeType = (bytes: Buffer): string | undefined => {
  if (hasBytes(bytes, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (hasBytes(bytes, 0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a') return 'image/gif';
  if (bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return undefined;
};

const uploadBytes = async (file: UploadFile): Promise<Buffer> => {
  if (Buffer.isBuffer(file.data)) return file.data;
  if (file.tempFilePath) return readFile(file.tempFilePath);
  throw new APIError('The server could not read the uploaded media bytes.', 400);
};

export const validateMediaUpload = async ({ data, file }: { data: MediaData; file: UploadFile }) => {
  const bytes = await uploadBytes(file);
  const detectedMimeType = detectMimeType(bytes);
  const actualSize = bytes.length;

  if (actualSize > MAX_MEDIA_BYTES) {
    throw new APIError(`Media exceeds the ${MAX_MEDIA_BYTES}-byte server limit.`, 400);
  }
  if (!detectedMimeType || !ALLOWED_MEDIA_TYPES.includes(detectedMimeType as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    throw new APIError('Media type is not allowed or its byte signature is unknown.', 400);
  }
  if (typeof data.rightsStatus !== 'string' || data.rightsStatus.trim().length === 0) {
    throw new APIError('Rights status is required before media can become eligible.', 400);
  }
  if (typeof data.rightsHolder !== 'string' || data.rightsHolder.trim().length === 0) {
    throw new APIError('Rights holder is required before media can become eligible.', 400);
  }
  if (typeof data.alt !== 'string' || data.alt.trim().length === 0) {
    throw new APIError('Alternative text is required before media can become eligible.', 400);
  }

  return {
    bytes,
    detectedMimeType,
    actualSize,
    contentHash: createHash('sha256').update(bytes).digest('hex')
  };
};

export const governMediaUpload: CollectionBeforeValidateHook = async ({ data, req }) => {
  const file = req.file;
  if (!file || !data) return data;

  const result = await validateMediaUpload({ data: data as MediaData, file });
  const context = asContext(req);
  const variants: Record<string, Buffer> = {};
  const uploadSizes = (req as any).payloadUploadSizes as Record<string, Buffer> | undefined;
  const sizes = (data as MediaData).sizes as Record<string, MediaData> | undefined;
  if (uploadSizes && sizes) {
    for (const [name, size] of Object.entries(sizes)) {
      if (Buffer.isBuffer(uploadSizes[name]) && typeof size.filename === 'string') variants[name] = uploadSizes[name];
    }
  }

  const uploadContext: MediaUploadContext = {
    source: result.bytes,
    variants,
    detectedMimeType: result.detectedMimeType,
    contentHash: result.contentHash
  };
  context.governedMediaUpload = uploadContext;
  data.mimeType = result.detectedMimeType;
  data.filesize = result.actualSize;
  data.detectedMimeType = result.detectedMimeType;
  data.contentHash = result.contentHash;
  data.eligibilityStatus = 'pending';
  data.storageState = 'pending';
  return data;
};

const clientConfig = (): S3ClientConfig => {
  const environment = loadEnvironment();
  const config: S3ClientConfig = {
    forcePathStyle: environment.media.forcePathStyle,
    region: environment.media.region ?? 'us-east-1'
  };
  if (environment.media.endpoint) config.endpoint = environment.media.endpoint;
  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    };
  }
  return config;
};

const s3Client = (): S3Client => new S3Client(clientConfig());

const variantManifest = (doc: MediaData, prefix: string) => {
  const variants: Record<string, MediaData> = {};
  const sizes = doc.sizes && typeof doc.sizes === 'object' ? doc.sizes : {};
  for (const name of Object.keys(sizes).sort()) {
    const size = sizes[name];
    if (!size || typeof size.filename !== 'string') continue;
    variants[name] = {
      filename: size.filename,
      mimeType: size.mimeType,
      filesize: size.filesize,
      width: size.width,
      height: size.height,
      objectKey: mediaObjectKey(prefix, size.filename),
      url: mediaDeliveryPath(prefix, size.filename)
    };
  }
  return variants;
};

const alertStorageFailure = async (req: PayloadRequest, doc: MediaData, error: unknown): Promise<void> => {
  const alert = {
    alert: 'media-storage-unavailable',
    severity: 'critical',
    mediaId: doc.id,
    correlation: `media-${doc.id}`,
    error: error instanceof Error ? error.name : 'UnknownError'
  };
  req.payload.logger.error(alert);
  const alertFile = process.env.MMDC_MEDIA_ALERT_FILE?.trim();
  if (alertFile) await appendFile(alertFile, `${JSON.stringify(alert)}\n`, 'utf8');
};

const updateGovernanceState = async (req: PayloadRequest, id: string | number, data: MediaData) => {
  const context = asContext(req);
  context.skipGovernedMedia = true;
  context.skipCloudStorage = true;
  return req.payload.update({
    collection: 'media',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req
  });
};

const uploadToS3 = async ({ bucket, doc, upload }: { bucket: string; doc: MediaData; upload: MediaUploadContext }) => {
  const prefix = String(doc.prefix);
  const client = s3Client();
  const uploadedKeys: string[] = [];
  const objects = [
    {
      body: upload.source,
      contentType: upload.detectedMimeType,
      key: mediaObjectKey(prefix, String(doc.filename))
    },
    ...Object.entries(upload.variants).map(([name, body]) => ({
      body,
      contentType: String(doc.sizes?.[name]?.mimeType || upload.detectedMimeType),
      key: mediaObjectKey(prefix, String(doc.sizes?.[name]?.filename))
    }))
  ];
  try {
    for (const object of objects) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Body: object.body,
          ContentLength: object.body.length,
          ContentType: object.contentType,
          Key: object.key
        })
      );
      uploadedKeys.push(object.key);
    }
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
    throw error;
  } finally {
    client.destroy();
  }
};

export const governMediaChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const context = asContext(req);
  const upload = context.governedMediaUpload as MediaUploadContext | undefined;
  if (!upload || context.skipGovernedMedia || !doc.filename || !doc.prefix) return doc;

  const environment = loadEnvironment();
  const common = {
    canonicalKey: mediaObjectKey(String(doc.prefix), String(doc.filename)),
    variantManifest: variantManifest(doc as MediaData, String(doc.prefix))
  };
  try {
    if (environment.mediaStorage === 's3') {
      if (!environment.media.bucket) throw new Error('Media bucket is not configured');
      await uploadToS3({ bucket: environment.media.bucket, doc: doc as MediaData, upload });
    }
    const updated = await updateGovernanceState(req, doc.id, {
      ...common,
      storageState: 'ready',
      eligibilityStatus: 'eligible'
    });
    return updated;
  } catch (error) {
    await alertStorageFailure(req, doc as MediaData, error);
    const updated = await updateGovernanceState(req, doc.id, {
      ...common,
      storageState: 'unavailable',
      eligibilityStatus: 'ineligible'
    });
    return updated;
  } finally {
    delete context.governedMediaUpload;
    req.file = undefined;
    delete (req as any).payloadUploadSizes;
  }
};

export const recoverMediaObjectVersion = async ({
  bucket,
  endpoint,
  forcePathStyle,
  key,
  region,
  versionId,
  accessKeyId,
  secretAccessKey
}: {
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  key: string;
  region: string;
  versionId: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}): Promise<void> => {
  const client = new S3Client({
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    forcePathStyle,
    region
  });
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${encodeURIComponent(`${bucket}/${key}`)}?versionId=${encodeURIComponent(versionId)}`,
        Key: key
      })
    );
  } finally {
    client.destroy();
  }
};

export const getMediaSource = async ({
  bucket,
  key,
  environment,
  localPath
}: {
  bucket?: string;
  key: string;
  environment: ReturnType<typeof loadEnvironment>;
  localPath?: string;
}): Promise<{ body: Buffer; contentType: string }> => {
  if (environment.mediaStorage === 's3') {
    if (!bucket) throw new Error('Media bucket is not configured');
    const client = s3Client();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error('Media object has no body');
      return {
        body: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType || 'application/octet-stream'
      };
    } finally {
      client.destroy();
    }
  }
  if (!localPath) throw new Error('Local media path is not configured');
  return { body: await readFile(localPath), contentType: 'application/octet-stream' };
};
