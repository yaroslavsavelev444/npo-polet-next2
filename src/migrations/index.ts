import * as migration_20260708_081550_initial from "./20260708_081550_initial.ts";
import * as migration_20260710_085725 from "./20260710_085725.ts";
import * as migration_20260710_100518_drop_legacy_audit_columns from "./20260710_100518_drop_legacy_audit_columns.ts";
import * as migration_20260710_100650_drop_legacy_audit_columns from "./20260710_100650_drop_legacy_audit_columns.ts";
import * as migration_20260710_120000_account_deletion_requests from "./20260710_120000_account_deletion_requests.ts";
import * as migration_20260713_080049_hero_background from "./20260713_080049_hero_background.ts";

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
    up: migration_20260710_100518_drop_legacy_audit_columns.up,
    down: migration_20260710_100518_drop_legacy_audit_columns.down,
    name: "20260710_100518_drop_legacy_audit_columns",
  },
  {
    up: migration_20260710_100650_drop_legacy_audit_columns.up,
    down: migration_20260710_100650_drop_legacy_audit_columns.down,
    name: "20260710_100650_drop_legacy_audit_columns",
  },
  {
    up: migration_20260710_120000_account_deletion_requests.up,
    down: migration_20260710_120000_account_deletion_requests.down,
    name: "20260710_120000_account_deletion_requests",
  },
  {
    up: migration_20260713_080049_hero_background.up,
    down: migration_20260713_080049_hero_background.down,
    name: "20260713_080049_hero_background",
  },
];
