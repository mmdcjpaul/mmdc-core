import * as migration_20260817_120247_initial_schema from './20260817_120247_initial_schema';
import * as migration_20260817_213500_search_worker_jobs from './20260817_213500_search_worker_jobs';

export const migrations = [
  {
    up: migration_20260817_120247_initial_schema.up,
    down: migration_20260817_120247_initial_schema.down,
    name: '20260817_120247_initial_schema'
  },
  {
    up: migration_20260817_213500_search_worker_jobs.up,
    down: migration_20260817_213500_search_worker_jobs.down,
    name: '20260817_213500_search_worker_jobs'
  }
];
