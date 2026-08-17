import { randomUUID } from 'node:crypto';
import path from 'node:path';

const safeStoragePart = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';

/** The persisted prefix is opaque, non-secret, and unique to one media record. */
export const createMediaRecordPrefix = (): string => `record-${randomUUID()}`;

export const mediaObjectKey = (recordPrefix: string, filename: string): string => {
  const safePrefix = safeStoragePart(recordPrefix);
  const safeFilename = safeStoragePart(path.posix.basename(filename));
  return `media/${safePrefix}/${safeFilename}`;
};

export const ensureMediaRecordPrefix = ({
  data,
  operation,
  originalDoc
}: {
  data: Record<string, unknown>;
  operation: string;
  originalDoc?: Record<string, unknown> | null;
}): Record<string, unknown> => {
  if (operation === 'create') {
    data.prefix = createMediaRecordPrefix();
  } else if (typeof originalDoc?.prefix === 'string' && originalDoc.prefix.length > 0) {
    data.prefix = originalDoc.prefix;
  } else if (typeof data.prefix !== 'string' || data.prefix.length === 0) {
    data.prefix = createMediaRecordPrefix();
  }
  return data;
};
