import config from '../../payload.config.ts';
import { getPayload } from 'payload';

const mode = process.argv[2];
const password = 'F02-test-only-password-123!';
const roles = ['admin', 'editor', 'author', 'viewer'];

if (!['create', 'verify'].includes(mode)) {
  throw new Error('usage: F02-T01-probe.mjs <create|verify>');
}

const payload = await getPayload({ config });
const shutdownWithError = async (error) => {
  console.error(error);
  void payload.destroy();
  process.exit(1);
};
process.on('uncaughtException', shutdownWithError);
process.on('unhandledRejection', shutdownWithError);
const collectionSlugs = payload.config.collections.map(({ slug }) => slug);

if (collectionSlugs.includes('payload-jobs')) {
  throw new Error('unrequired Payload jobs schema was enabled');
}

for (const slug of ['users', 'media']) {
  const collection = payload.config.collections.find((entry) => entry.slug === slug);
  if (collection?.versions) throw new Error(`unrequired versions enabled for ${slug}`);
}

if (mode === 'create') {
  const users = [];
  for (const role of roles) {
    const email = `${role}@f02-t01.example.test`;
    const user = await payload.create({
      collection: 'users',
      data: { email, password, role },
      overrideAccess: true
    });
    const login = await payload.login({
      collection: 'users',
      data: { email, password },
      overrideAccess: false
    });
    if (login.user.role !== role) throw new Error(`authentication lost role ${role}`);
    users.push(user);
  }

  let unauthenticatedReadRejected = false;
  try {
    await payload.find({ collection: 'media', overrideAccess: false });
  } catch {
    unauthenticatedReadRejected = true;
  }
  if (!unauthenticatedReadRejected) throw new Error('unauthenticated media read was allowed');

  let unauthenticatedCreateRejected = false;
  try {
    await payload.create({
      collection: 'media',
      data: { alt: 'unauthenticated' },
      overrideAccess: false
    });
  } catch {
    unauthenticatedCreateRejected = true;
  }
  if (!unauthenticatedCreateRejected) throw new Error('unauthenticated media create was allowed');

  for (const user of users) {
    const result = await payload.find({
      collection: 'media',
      overrideAccess: false,
      user
    });
    if (result.totalDocs !== 0) throw new Error(`unexpected media documents for ${user.role}`);
  }

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwAAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64'
  );
  const media = await payload.create({
    collection: 'media',
    data: { alt: 'Foundation probe' },
    file: {
      data: png,
      mimetype: 'image/png',
      name: 'foundation.png',
      size: png.length
    },
    overwriteExistingFiles: true,
    overrideAccess: false,
    user: users[1]
  });
  if (media.alt !== 'Foundation probe' || media.filename !== 'foundation.png' || media.mimeType !== 'image/png') {
    throw new Error('media metadata was not persisted');
  }

  console.log(JSON.stringify({ roles, mediaId: media.id, unauthenticatedCreateRejected, unauthenticatedReadRejected }));
} else {
  for (const role of roles) {
    const result = await payload.find({
      collection: 'users',
      overrideAccess: true,
      where: { email: { equals: `${role}@f02-t01.example.test` } }
    });
    if (result.totalDocs !== 1 || result.docs[0].role !== role) {
      throw new Error(`role ${role} did not persist across process restart`);
    }
  }

  const media = await payload.find({
    collection: 'media',
    limit: 1,
    overrideAccess: true,
    where: { alt: { equals: 'Foundation probe' } }
  });
  if (media.totalDocs !== 1 || media.docs[0].filename !== 'foundation.png') {
    throw new Error('media metadata did not persist across process restart');
  }
  console.log(JSON.stringify({ persistedRoles: roles, persistedMedia: media.docs[0].id }));
}

void payload.destroy();
process.exit(0);
