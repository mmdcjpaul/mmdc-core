import * as migration_20260817_120247_initial_schema from './20260817_120247_initial_schema';
import * as migration_20260817_213500_search_worker_jobs from './20260817_213500_search_worker_jobs';
import * as migration_20260817_220000_search_projection from './20260817_220000_search_projection';
import * as migration_20260817_223000_media_storage from './20260817_223000_media_storage';
import * as migration_20260817_230000_media_governance from './20260817_230000_media_governance';

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
  },
  {
    up: migration_20260817_220000_search_projection.up,
    down: migration_20260817_220000_search_projection.down,
    name: '20260817_220000_search_projection'
  },
  {
    up: migration_20260817_223000_media_storage.up,
    down: migration_20260817_223000_media_storage.down,
    name: '20260817_223000_media_storage'
  },
  {
    up: migration_20260817_230000_media_governance.up,
    down: migration_20260817_230000_media_governance.down,
    name: '20260817_230000_media_governance'
  }
];
