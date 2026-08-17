import type { CollectionConfig } from 'payload';

import { FOUNDATION_SEARCH_COLLECTION, type SearchProjectionJob } from '../search/projection.ts';

const authenticated = ({ req }: { req: { user?: unknown } }): boolean => Boolean(req.user);

export const FoundationSearchRecords: CollectionConfig = {
  slug: FOUNDATION_SEARCH_COLLECTION,
  admin: {
    useAsTitle: 'value'
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated
  },
  fields: [
    {
      name: 'canonicalVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      required: true
    },
    {
      name: 'value',
      type: 'text',
      required: true
    }
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        if (operation === 'update' && data.canonicalVersion === undefined) {
          data.canonicalVersion = Number(originalDoc?.canonicalVersion ?? 0) + 1;
        }
        return data;
      }
    ],
    afterChange: [
      async ({ doc, req, context }) => {
        if (context.skipFoundationSearchProjection) return doc;
        const job: SearchProjectionJob = {
          operation: 'upsert',
          recordId: String(doc.id),
          canonicalVersion: Number(doc.canonicalVersion),
          value: String(doc.value)
        };
        await req.payload.jobs.queue({
          task: 'foundation-search-projection',
          input: job,
          overrideAccess: true,
          req
        });
        return doc;
      }
    ],
    afterDelete: [
      async ({ doc, req, context }) => {
        if (context.skipFoundationSearchProjection) return doc;
        const job: SearchProjectionJob = {
          operation: 'delete',
          recordId: String(doc.id),
          canonicalVersion: Number(doc.canonicalVersion)
        };
        await req.payload.jobs.queue({
          task: 'foundation-search-projection',
          input: job,
          overrideAccess: true,
          req
        });
        return doc;
      }
    ]
  },
  timestamps: true
};
