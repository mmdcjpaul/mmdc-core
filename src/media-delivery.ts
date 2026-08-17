import path from 'node:path';

import type { Endpoint, PayloadRequest } from 'payload';

import { loadEnvironment } from './environment.ts';
import { getMediaSource } from './media-governance.ts';
import { mediaObjectKey } from './media-storage.ts';

export const governedMediaFallback = (): Response =>
  Response.json(
    { eligible: false, error: 'MEDIA_UNAVAILABLE', fallback: 'media-unavailable' },
    { headers: { 'Cache-Control': 'no-store' }, status: 503 }
  );

const unauthorized = (): Response => Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

const findMedia = async (req: PayloadRequest, identifier: string) => {
  if (/^\d+$/.test(identifier)) {
    return req.payload.findByID({ collection: 'media', id: Number(identifier), depth: 0, overrideAccess: true });
  }
  const found = await req.payload.find({
    collection: 'media',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { prefix: { equals: identifier } }
  });
  return found.docs[0];
};

export const deliverMedia = async (req: PayloadRequest): Promise<Response> => {
  if (!req.user) return unauthorized();
  const url = new URL(req.url || 'http://mmdc.invalid');
  const parts = url.pathname.split('/').filter(Boolean);
  const identifier = decodeURIComponent(parts[parts.length - 1] || '');
  if (!identifier) return governedMediaFallback();

  const doc = await findMedia(req, identifier);
  if (!doc || doc.eligibilityStatus !== 'eligible' || doc.storageState !== 'ready') return governedMediaFallback();

  const requestedFilename = url.searchParams.get('file');
  const mainFilename = String(doc.filename);
  let filename = mainFilename;
  let objectKey = String(doc.canonicalKey || mediaObjectKey(String(doc.prefix), mainFilename));
  let contentType = String(doc.detectedMimeType || doc.mimeType || 'application/octet-stream');
  if (requestedFilename && requestedFilename !== mainFilename) {
    const variant = Object.values((doc.variantManifest || {}) as Record<string, any>).find(
      (candidate) => candidate?.filename === path.posix.basename(requestedFilename)
    ) as Record<string, any> | undefined;
    if (!variant) return governedMediaFallback();
    filename = String(variant.filename);
    objectKey = String(variant.objectKey);
    contentType = String(variant.mimeType || contentType);
  }

  try {
    const environment = loadEnvironment();
    const localPath =
      environment.mediaStorage === 'local'
        ? path.join(process.env.MMDC_MEDIA_DIR?.trim() || path.join(process.cwd(), 'media'), filename)
        : undefined;
    const source = await getMediaSource({
      bucket: environment.media.bucket,
      environment,
      key: objectKey,
      localPath
    });
    return new Response(source.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Length': String(source.body.length),
        'Content-Type': source.contentType || contentType,
        'Content-Disposition': `inline; filename="${path.posix.basename(filename).replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff'
      },
      status: 200
    });
  } catch (error) {
    req.payload.logger.error({
      alert: 'media-delivery-unavailable',
      correlation: `media-${doc.id}`,
      error: error instanceof Error ? error.name : 'UnknownError',
      mediaId: doc.id
    });
    return governedMediaFallback();
  }
};

export const mediaDeliveryEndpoint: Endpoint = {
  handler: deliverMedia,
  method: 'get',
  path: '/media-delivery/:id'
};
