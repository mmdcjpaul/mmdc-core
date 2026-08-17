import type { TaskConfig, TaskHandler } from 'payload';

export type FoundationSearchTask = {
  input: {
    marker?: string;
    durationMs?: number;
    failUntilAttempt?: number;
  };
  output: {
    marker: string;
    attempt: number;
  };
};

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const markerPath = (): string | undefined => process.env.MMDC_WORKER_PROBE_FILE?.trim() || undefined;

export const foundationSearchTaskHandler: TaskHandler<FoundationSearchTask> = async ({ input, job, req }) => {
  const marker = input.marker?.trim() || `job-${String(job.id)}`;
  const attempt = (job.totalTried ?? 0) + 1;
  const failUntilAttempt = Math.max(0, Math.floor(input.failUntilAttempt ?? 0));
  const durationMs = Math.min(30_000, Math.max(0, Math.floor(input.durationMs ?? 0)));
  const heartbeat = setInterval(() => {
    void req.payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { processing: true },
      depth: 0,
      overrideAccess: true,
      disableTransaction: true
    });
  }, 250);

  try {
    if (durationMs > 0) await sleep(durationMs);
    if (attempt <= failUntilAttempt) throw new Error(`deterministic probe failure on attempt ${attempt}`);
    const path = markerPath();
    if (path) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(path, `${JSON.stringify({ marker, attempt, jobId: job.id })}\n`);
    }
    return { state: 'succeeded', output: { marker, attempt } };
  } finally {
    clearInterval(heartbeat);
  }
};

export const foundationSearchTask: TaskConfig<FoundationSearchTask> = {
  slug: 'foundation-search-probe',
  label: 'Foundation search worker probe',
  handler: foundationSearchTaskHandler,
  retries: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 100 }
  }
};
