import type { CollectionConfig } from 'payload';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email'
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      defaultValue: 'viewer',
      hasMany: false,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Author', value: 'author' },
        { label: 'Viewer', value: 'viewer' }
      ],
      required: true,
      saveToJWT: true
    }
  ],
  timestamps: true
};
