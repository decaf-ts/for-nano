import { BaseModel, column, pk, table } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { NanoAdapter, NanoRepository } from "../../src";
import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";
import { nanoRepository } from "../helpers/repository";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

//
// REGRESSION TEST — Double-revert in the query path clobbers column-mapped fields
//
// Previously CouchDBStatement.raw() reverted records (processRecord) and THEN
// core Statement.execute() reverted them AGAIN. The second revert looked up
// column names (e.g. "mapped_name") on already-reverted model instances (which
// only had the property name "name"), so every @column-mapped field came back
// as undefined from select().execute().
//
// The fix: CouchDBStatement.raw() now follows the core contract — it reverts
// only when a selectSelector is set, and returns raw docs otherwise so
// execute() performs the single revert.
//
// (Note: querying @column-mapped fields via where()/select(['field']) is a
// separate issue — query building does not translate property names to column
// names — covered by its own regression test.)
//

@uses("nano")
@table("colmap")
@model()
class ColumnMappedModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @column("mapped_name")
  @required()
  name!: string;

  @column("mapped_value")
  @required()
  value!: number;

  constructor(arg?: ModelArg<ColumnMappedModel>) {
    super(arg);
  }
}

describe("REGRESSION: column-mapped fields survive the query path (no double-revert)", () => {
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let repo: NanoRepository<ColumnMappedModel>;

  beforeAll(async () => {
    resources = await createNanoTestResources("reg_double_revert");
    adapter = new NanoAdapter({
      couchUser: resources.user,
      couchPassword: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
    await adapter.initialize();
    repo = nanoRepository(ColumnMappedModel);

    await repo.createAll([
      new ColumnMappedModel({ id: 1, name: "alpha", value: 10 }),
      new ColumnMappedModel({ id: 2, name: "beta", value: 20 }),
      new ColumnMappedModel({ id: 3, name: "gamma", value: 30 }),
    ]);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("preserves column-mapped fields in select().execute()", async () => {
    const results = await repo.select().execute();
    expect(results.length).toBe(3);

    const byId = (id: number) => results.find((r) => r.id === id)!;
    expect(byId(1).name).toBe("alpha");
    expect(byId(1).value).toBe(10);
    expect(byId(2).name).toBe("beta");
    expect(byId(2).value).toBe(20);
    expect(byId(3).name).toBe("gamma");
    expect(byId(3).value).toBe(30);

    // Results must be real model instances, not raw docs.
    expect(results.every((r) => r instanceof ColumnMappedModel)).toBe(true);
  });

  it("preserves column-mapped fields across create -> read -> update -> read", async () => {
    const created = await repo.create(
      new ColumnMappedModel({ id: 99, name: "delta", value: 40 })
    );
    expect(created.name).toBe("delta");

    const read = await repo.read(99);
    expect(read.name).toBe("delta");
    expect(read.value).toBe(40);

    read.value = 45;
    await repo.update(read);
    const reread = await repo.read(99);
    expect(reread.name).toBe("delta");
    expect(reread.value).toBe(45);

    await repo.delete(99);
  });
});
