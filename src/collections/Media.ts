import path from 'node:path';

import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload';

import { ensureMediaRecordPrefix } from '../media-storage.ts';

const authenticated = ({ req }: { req: { user?: unknown } }): boolean => Boolean(req.user);

const ensureStoragePrefix: CollectionBeforeValidateHook = ({ data, operation, originalDoc }) =>
  ensureMediaRecordPrefix({
    data: data as Record<string, unknown>,
    operation,
    originalDoc: originalDoc as Record<string, unknown> | null | undefined
  });

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename'
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated
  },
  hooks: {
    beforeValidate: [ensureStoragePrefix]
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
    mimeTypes: ['image/*', 'application/pdf'],
    staticDir: path.resolve(process.env.MMDC_MEDIA_DIR?.trim() || path.join(process.cwd(), 'media'))
  },
  timestamps: true
};
