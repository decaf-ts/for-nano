import { Adapter } from "@decaf-ts/core";
import { AbsMigration, migration, MigrationService } from "@decaf-ts/core/migrations";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

const TEST_FLAVOUR = "nano-live-migration-add-property";
const TABLE = "for_nano_migration_products";

class LiveNanoAdapter extends NanoAdapter {
  constructor(conf: any, alias?: string) {
    super(conf, alias);
    (this as any).flavour = TEST_FLAVOUR;
    (Adapter as any)._cache[TEST_FLAVOUR] = this;
  }
}

@migration("1.1.0-for-nano-live-add-category", "1.1.0", TEST_FLAVOUR)
class AddCategoryMigration extends AbsMigration<any> {
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
      .filter((doc: any) => doc._id.startsWith(`${TABLE}__`))
      .map((doc: any) => ({
        ...doc,
        category: doc.category || "dairy",
      }));

    if (docs.length) await qr.bulk({ docs });
  }
}

@migration("2.0.0-for-nano-live-remove-legacy", "2.0.0", TEST_FLAVOUR)
class RemoveLegacyMigration extends AbsMigration<any> {
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
      .filter((doc: any) => doc._id.startsWith(`${TABLE}__`))
      .map((doc: any) => {
        const clone = { ...doc };
        delete clone.legacy;
        return clone;
      });

    if (docs.length) await qr.bulk({ docs });
  }
}

void AddCategoryMigration;
void RemoveLegacyMigration;

describe("for-nano migration property add/delete flow", () => {
  it("applies property additions/removals against a live CouchDB instance", async () => {
    const resources = await createNanoTestResources("for_nano_migration_add_prop");
    const adapter = new LiveNanoAdapter(
      {
        user: resources.user,
        password: resources.password,
        host: resources.host,
        dbName: resources.dbName,
        protocol: resources.protocol,
      },
      TEST_FLAVOUR
    );

    const versions: Record<string, string> = {
      [TEST_FLAVOUR]: "1.0.0",
    };

    try {
      await adapter.initialize();
      await adapter.client.bulk({
        docs: [
          {
            _id: `${TABLE}__p-1`,
            id: "p-1",
            name: "milk",
            legacy: "yes",
          },
        ],
      });

      await MigrationService.migrateAdapters([adapter as any], {
        toVersion: "2.0.0",
        handlers: {
          [TEST_FLAVOUR]: {
            retrieveLastVersion: async () => versions[TEST_FLAVOUR],
            setCurrentVersion: async (version) => {
              versions[TEST_FLAVOUR] = version;
            },
          },
        },
      } as any);

      const migrated = await adapter.client.get(`${TABLE}__p-1`);

      expect((migrated as any).category).toBe("dairy");
      expect((migrated as any).legacy).toBeUndefined();
      expect(versions[TEST_FLAVOUR]).toBe("2.0.0");
    } finally {
      await adapter.shutdown().catch(() => undefined);
      await cleanupNanoTestResources(resources);
    }
  });
});
