import * as migration_20260708_081550_initial from './20260708_081550_initial';

export const migrations = [
  {
    up: migration_20260708_081550_initial.up,
    down: migration_20260708_081550_initial.down,
    name: '20260708_081550_initial'
  },
];
