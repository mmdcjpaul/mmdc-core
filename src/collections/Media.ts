import path from 'node:path';

import type { Access, CollectionBeforeValidateHook, CollectionConfig } from 'payload';

import { governMediaChange, governMediaUpload } from '../media-governance.ts';
import { ensureMediaRecordPrefix } from '../media-storage.ts';

const authenticated = ({ req }: { req: { user?: unknown } }): boolean => Boolean(req.user);

const ensureStoragePrefix: CollectionBeforeValidateHook = ({ data, operation, originalDoc }) =>
  ensureMediaRecordPrefix({
    data: data as Record<string, unknown>,
    operation,
    originalDoc: originalDoc as Record<string, unknown> | null | undefined
  });

const eligibleMediaRead: Access = async ({ id, req }) => {
  if (!req.user) return false;
  if (id === undefined || id === null) return true;
  const doc = await req.payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true });
  return doc.eligibilityStatus === 'eligible' && doc.storageState === 'ready';
};

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename'
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: eligibleMediaRead,
    update: authenticated
  },
  hooks: {
    afterChange: [governMediaChange],
    beforeValidate: [ensureStoragePrefix, governMediaUpload]
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true
    },
    {
      name: 'caption',
      type: 'textarea'
    },
    {
      name: 'rightsStatus',
      type: 'select',
      options: ['owned', 'licensed', 'public-domain', 'cc0', 'cc-by', 'cc-by-sa'],
      admin: { position: 'sidebar' }
    },
    {
      name: 'rightsHolder',
      type: 'text',
      admin: { position: 'sidebar' }
    },
    {
      name: 'isDecorative',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' }
    },
    {
      name: 'detectedMimeType',
      type: 'text',
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'contentHash',
      type: 'text',
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'eligibilityStatus',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'eligible', 'ineligible'],
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'storageState',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'ready', 'unavailable'],
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'canonicalKey',
      type: 'text',
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'variantManifest',
      type: 'json',
      admin: { hidden: true, readOnly: true }
    },
    {
      name: 'prefix',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true
      }
    }
  ],
  upload: {
    adminThumbnail: 'thumbnail',
    filesRequiredOnCreate: false,
    imageSizes: [
      { name: 'thumbnail', width: 160, height: 120, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' }
    ],
    mimeTypes: ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    staticDir: path.resolve(process.env.MMDC_MEDIA_DIR?.trim() || path.join(process.cwd(), 'media'))
  },
  timestamps: true
};
