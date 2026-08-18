import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FoundationSearchRecords } from '../../src/collections/FoundationSearchRecords';
import { Media } from '../../src/collections/Media';
import { Users } from '../../src/collections/Users';

describe('foundation schema contract', () => {
  it('keeps the approved authenticated users role values', () => {
    const roleField = Users.fields.find((field) => 'name' in field && field.name === 'role');
    assert.ok(roleField && 'options' in roleField);
    assert.deepEqual(roleField.options, [
      { label: 'Administrator', value: 'admin' },
      { label: 'Editor', value: 'editor' },
      { label: 'Author', value: 'author' },
      { label: 'Viewer', value: 'viewer' }
    ]);
  });

  it('keeps media governed and the synthetic search collection present', () => {
    assert.equal(Media.slug, 'media');
    assert.equal(typeof Media.access?.read, 'function');
    assert.equal(FoundationSearchRecords.slug, 'foundation-search-records');
  });
});
