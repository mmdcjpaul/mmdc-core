export type BootstrapPayload = {
  find: (args: { collection: string; limit: number; overrideAccess: boolean }) => Promise<{ totalDocs: number }>;
  create: (args: {
    collection: string;
    data: { email: string; password: string; role: 'admin' };
    overrideAccess: boolean;
  }) => Promise<unknown>;
};

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export const validateBootstrapInput = (email: string, password: string): void => {
  if (!email.trim() || !email.includes('@')) throw new BootstrapError('administrator email is invalid');
  if (password.length < 12) throw new BootstrapError('administrator password must be at least 12 characters');
};

export const bootstrapInitialAdministrator = async (
  payload: BootstrapPayload,
  credentials: { email: string; password: string }
): Promise<void> => {
  validateBootstrapInput(credentials.email, credentials.password);
  const existing = await payload.find({ collection: 'users', limit: 1, overrideAccess: true });
  if (existing.totalDocs > 0) {
    throw new BootstrapError('bootstrap is one-time only; the users collection is not empty');
  }

  await payload.create({
    collection: 'users',
    data: { email: credentials.email, password: credentials.password, role: 'admin' },
    overrideAccess: true
  });
};
