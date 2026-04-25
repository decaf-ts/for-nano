import { Adapter } from "@decaf-ts/core";
import { AbsMigration, migration, MigrationService } from "@decaf-ts/core/migrations";
import { RamAdapter } from "@decaf-ts/core/ram";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

const NANO_FLAVOUR = "nano-live-multi";
const RAM_FLAVOUR = "ram-live-multi";

const NANO_TABLE = "for_nano_multi_products";
const RAM_TABLE = "for_nano_multi_ram";

class LiveNanoAdapter extends NanoAdapter {
  constructor(conf: any, alias?: string) {
    super(conf, alias);
    (this as any).flavour = NANO_FLAVOUR;
    (Adapter as any)._cache[NANO_FLAVOUR] = this;
  }
}

class LiveRamAdapter extends RamAdapter {
  constructor(conf: any = {}, alias?: string) {
    super(conf, alias);
    (this as any).flavour = RAM_FLAVOUR;
    (Adapter as any)._cache[RAM_FLAVOUR] = this;
  }
}

@migration("1.0.1-nano-live-multi", "1.0.1", NANO_FLAVOUR)
class NanoMigrationHop101 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {
    return;
  }
  async down(): Promise<void> {
    return;
  }
  async migrate(qr: any): Promise<void> {
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(`${NANO_TABLE}__`))
      .map((doc: any) => ({
        ...doc,
        category: doc.category || "dairy",
      }));
    if (docs.length) await qr.bulk({ docs });
  }
}

@migration("1.0.2-nano-live-multi", "1.0.2", NANO_FLAVOUR)
class NanoMigrationHop102 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {
    return;
  }
  async down(): Promise<void> {
    return;
  }
  async migrate(qr: any): Promise<void> {
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(`${NANO_TABLE}__`))
      .map((doc: any) => ({
        ...doc,
        stage: doc.stage || "stable",
      }));
    if (docs.length) await qr.bulk({ docs });
  }
}

@migration("1.0.1-ram-live-multi", "1.0.1", RAM_FLAVOUR)
class RamMigrationHop101 extends AbsMigration<
  LiveRamAdapter,
  Map<string, Map<string, any>>
> {
  protected getQueryRunner(conn: LiveRamAdapter): Map<string, Map<string, any>> {
    return conn.client;
  }
  async up(): Promise<void> {
    return;
  }
  async down(): Promise<void> {
    return;
  }
  async migrate(qr: Map<string, Map<string, any>>): Promise<void> {
    const table = qr.get(RAM_TABLE);
    if (!table) return;
    for (const [id, doc] of table.entries()) {
      table.set(id, {
        ...doc,
        ramCategory: doc.ramCategory || "dairy",
      });
    }
  }
}

@migration("1.0.2-ram-live-multi", "1.0.2", RAM_FLAVOUR)
class RamMigrationHop102 extends AbsMigration<
  LiveRamAdapter,
  Map<string, Map<string, any>>
> {
  protected getQueryRunner(conn: LiveRamAdapter): Map<string, Map<string, any>> {
    return conn.client;
  }
  async up(): Promise<void> {
    return;
  }
  async down(): Promise<void> {
    return;
  }
  async migrate(qr: Map<string, Map<string, any>>): Promise<void> {
    const table = qr.get(RAM_TABLE);
    if (!table) return;
    for (const [id, doc] of table.entries()) {
      table.set(id, {
        ...doc,
        ramStage: doc.ramStage || "stable",
      });
    }
  }
}

void NanoMigrationHop101;
void NanoMigrationHop102;
void RamMigrationHop101;
void RamMigrationHop102;

describe("for-nano live multi-adapter migration", () => {
  it("runs schema changes across Nano and Ram adapters against live databases", async () => {
    const nanoResources = await createNanoTestResources("for_nano_multi");
    const nano = new LiveNanoAdapter(
      {
        user: nanoResources.user,
        password: nanoResources.password,
        host: nanoResources.host,
        dbName: nanoResources.dbName,
        protocol: nanoResources.protocol,
      },
      NANO_FLAVOUR
    );
    const ram = new LiveRamAdapter({}, RAM_FLAVOUR);

    const versions: Record<string, string> = {
      [NANO_FLAVOUR]: "1.0.0",
      [RAM_FLAVOUR]: "1.0.0",
    };

    try {
      await nano.initialize();
      await ram.initialize();

      await nano.client.bulk({
        docs: [
          {
            _id: `${NANO_TABLE}__p-1`,
            id: "p-1",
            name: "milk",
          },
        ],
      });

      ram.client.set(
        RAM_TABLE,
        new Map([
          [
            "r-1",
            {
              id: "r-1",
              name: "ram-storage",
            },
          ],
        ])
      );

      await MigrationService.migrateAdapters(
        [nano as any, ram as any],
        {
          toVersion: "1.0.2",
          handlers: {
            [NANO_FLAVOUR]: {
              retrieveLastVersion: async () => versions[NANO_FLAVOUR],
              setCurrentVersion: async (version: string) => {
                versions[NANO_FLAVOUR] = version;
              },
            },
            [RAM_FLAVOUR]: {
              retrieveLastVersion: async () => versions[RAM_FLAVOUR],
              setCurrentVersion: async (version: string) => {
                versions[RAM_FLAVOUR] = version;
              },
            },
          },
        } as any
      );

      const nanoDoc = await nano.client.get(`${NANO_TABLE}__p-1`);
      expect((nanoDoc as any).category).toBe("dairy");
      expect((nanoDoc as any).stage).toBe("stable");

      const ramDoc = ram.client.get(RAM_TABLE)?.get("r-1");
      expect(ramDoc?.ramCategory).toBe("dairy");
      expect(ramDoc?.ramStage).toBe("stable");

      expect(versions[NANO_FLAVOUR]).toBe("1.0.2");
      expect(versions[RAM_FLAVOUR]).toBe("1.0.2");
    } finally {
      await ram.shutdown().catch(() => undefined);
      await nano.shutdown().catch(() => undefined);
      await cleanupNanoTestResources(nanoResources);
    }
  });
});
