import * as migration_20260817_120247_initial_schema from './20260817_120247_initial_schema';

export const migrations = [
  {
    up: migration_20260817_120247_initial_schema.up,
    down: migration_20260817_120247_initial_schema.down,
    name: '20260817_120247_initial_schema'
  }
];
