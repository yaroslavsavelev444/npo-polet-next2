import * as migration_20260708_081550_initial from "./20260708_081550_initial.ts";
import * as migration_20260710_085725 from "./20260710_085725.ts";
import * as migration_20260710_120000_account_deletion_requests from "./20260710_120000_account_deletion_requests.ts";

export const migrations = [
  {
    up: migration_20260708_081550_initial.up,
    down: migration_20260708_081550_initial.down,
    name: "20260708_081550_initial",
  },
  {
    up: migration_20260710_085725.up,
    down: migration_20260710_085725.down,
    name: "20260710_085725",
  },
  {
    up: migration_20260710_120000_account_deletion_requests.up,
    down: migration_20260710_120000_account_deletion_requests.down,
    name: "20260710_120000_account_deletion_requests",
  },
];
