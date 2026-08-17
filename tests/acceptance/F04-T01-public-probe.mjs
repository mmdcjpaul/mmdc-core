import assert from 'node:assert/strict';

import { GET } from '../../src/app/api/health/route.ts';

const privilegedSentinels = [
  'F04-T01-PRIVILEGED-KEY-SENTINEL',
  'F04-T01-PRIVILEGED-KEY-SENTINEL-master',
  'F04-T01-PRIVILEGED-KEY-SENTINEL-admin',
  'F04-T01-PRIVILEGED-KEY-SENTINEL-search'
];
const response = GET();
const body = await response.text();
assert.equal(response.status, 200);
assert.equal(body, '{"status":"ok"}');
for (const sentinel of privilegedSentinels) assert.doesNotMatch(body, new RegExp(sentinel));
console.log('F04-T01 public probe: server-owned health response is sanitized');
