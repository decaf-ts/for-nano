import { Adapter, index, pk } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";
import { NanoAdapter, NanoFlavour } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

@uses(NanoFlavour)
@model()
class PrimaryNanoOwnedModel extends Model {
  @pk({ type: String })
  id!: string;

  @index()
  primaryName!: string;

  constructor(arg?: ModelArg<PrimaryNanoOwnedModel>) {
    super(arg);
  }
}

@uses("second")
@model()
class SecondaryNanoOwnedModel extends Model {
  @pk({ type: String })
  id!: string;

  @index()
  secondaryTitle!: string;

  constructor(arg?: ModelArg<SecondaryNanoOwnedModel>) {
    super(arg);
  }
}

describe("nano adapter model ownership and initialize() indexing (live couchdb)", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let primaryAdapter: NanoAdapter;
  let secondaryAdapter: NanoAdapter;

  const secondAlias = "second";

  async function listIndexNames(): Promise<string[]> {
    const db = resources.connection.use(resources.dbName) as any;
    const result = await db.list({
      startkey: "_design/",
      endkey: "_design0",
      include_docs: false,
    });
    return (result?.rows || [])
      .map((row: any) => String(row?.id || ""))
      .filter((id: string) => id.startsWith("_design/"))
      .map((id: string) => id.replace("_design/", ""))
      .filter((name: string) => name.length > 0);
  }

  beforeAll(async () => {
    resources = await createNanoTestResources("alias_init_indexing");
    const conf = {
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    };

    primaryAdapter = new NanoAdapter(conf);
    secondaryAdapter = new NanoAdapter(conf, secondAlias);
  });

  afterAll(async () => {
    Adapter.unregister(secondAlias);
    if (secondaryAdapter) await secondaryAdapter.shutdown().catch(() => undefined);
    if (primaryAdapter) await primaryAdapter.shutdown().catch(() => undefined);
    if (resources) await cleanupNanoTestResources(resources);
  });

  it("indexes only its owned models on initialize, per adapter alias", async () => {
    const primaryModels = Adapter.models(NanoFlavour);
    const secondaryModels = Adapter.models(secondAlias);

    expect(primaryModels).toContain(PrimaryNanoOwnedModel as any);
    expect(primaryModels).not.toContain(SecondaryNanoOwnedModel as any);
    expect(secondaryModels).toContain(SecondaryNanoOwnedModel as any);
    expect(secondaryModels).not.toContain(PrimaryNanoOwnedModel as any);

    const before = await listIndexNames();
    expect(before).not.toContain("PrimaryNanoOwnedModel_id_index");
    expect(before).not.toContain("SecondaryNanoOwnedModel_id_index");

    await primaryAdapter.initialize();

    const afterPrimaryInit = await listIndexNames();
    expect(afterPrimaryInit).toContain("PrimaryNanoOwnedModel_id_index");
    expect(afterPrimaryInit).toContain("PrimaryNanoOwnedModel_id_asc_index");
    expect(afterPrimaryInit).toContain("PrimaryNanoOwnedModel_id_desc_index");
    expect(afterPrimaryInit).not.toContain("SecondaryNanoOwnedModel_id_index");

    await secondaryAdapter.initialize();

    const afterSecondaryInit = await listIndexNames();
    expect(afterSecondaryInit).toContain("SecondaryNanoOwnedModel_id_index");
    expect(afterSecondaryInit).toContain("SecondaryNanoOwnedModel_id_asc_index");
    expect(afterSecondaryInit).toContain(
      "SecondaryNanoOwnedModel_id_desc_index"
    );
  });
});
