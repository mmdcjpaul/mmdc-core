export const protectedEnvironments = ['development', 'staging', 'production'] as const;
export type ProtectedEnvironment = (typeof protectedEnvironments)[number];
export type SeedAction = 'seed' | 'reset';

export const syntheticFixtureName = 'foundation';
export const breakGlassGuardValue = 'I_UNDERSTAND_PROTECTED_SEED_RESET';

export type BreakGlassApproval = {
  approvalId: string;
  approver: string;
  environment: string;
  action: SeedAction;
  approvedAt: string;
  expiresAt: string;
};

export type SeedRequest = {
  action: SeedAction;
  environment: string;
  fixture: string;
  breakGlass?: {
    guardValue: string;
    approval: BreakGlassApproval;
  };
  now?: Date;
};

export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedGuardError';
  }
}

const isProtectedEnvironment = (environment: string): environment is ProtectedEnvironment =>
  protectedEnvironments.includes(environment as ProtectedEnvironment);

export const validateBreakGlassApproval = (request: SeedRequest): void => {
  const guard = request.breakGlass;
  if (!guard || guard.guardValue !== breakGlassGuardValue) {
    throw new SeedGuardError(
      `${request.action} is refused for ${request.environment}; an explicit, time-bounded break-glass approval is required`
    );
  }

  const approval = guard.approval;
  const now = request.now ?? new Date();
  if (!approval.approvalId.trim() || !approval.approver.trim()) {
    throw new SeedGuardError('break-glass approval must name an approval ID and approver');
  }
  if (approval.environment !== request.environment || approval.action !== request.action) {
    throw new SeedGuardError('break-glass approval does not match the requested environment or action');
  }

  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= approvedAt ||
    expiresAt <= now.getTime()
  ) {
    throw new SeedGuardError('break-glass approval is invalid or expired');
  }
};

export const assertSeedRequestAllowed = (request: SeedRequest): void => {
  if (request.fixture !== syntheticFixtureName) {
    throw new SeedGuardError(`only the synthetic ${syntheticFixtureName} fixture is available`);
  }
  if (!['local', 'ci', 'development', 'staging', 'production'].includes(request.environment)) {
    throw new SeedGuardError(`unknown environment: ${request.environment}`);
  }
  if (isProtectedEnvironment(request.environment)) validateBreakGlassApproval(request);
};
