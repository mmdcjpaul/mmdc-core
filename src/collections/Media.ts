import path from 'node:path';

import type { CollectionConfig } from 'payload';

const authenticated = ({ req }: { req: { user?: unknown } }): boolean => Boolean(req.user);

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
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true
    },
    {
      name: 'caption',
      type: 'textarea'
    }
  ],
  upload: {
    adminThumbnail: 'thumbnail',
    mimeTypes: ['image/*', 'application/pdf'],
    staticDir: path.resolve(process.env.MMDC_MEDIA_DIR?.trim() || path.join(process.cwd(), 'media'))
  },
  timestamps: true
};
