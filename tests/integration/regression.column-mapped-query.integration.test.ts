import {
  BaseModel,
  column,
  pk,
  table,
  Condition,
  OrderDirection,
} from "@decaf-ts/core";
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
// REGRESSION TEST — Query building does not translate property names to
// @column-mapped column names.
//
// Previously build() & parseCondition() used raw property names as Mango
// selector keys / projection fields / sort keys, so querying @column-mapped
// fields by property name never matched the stored column names (e.g. querying
// "name" against a doc that stores "mapped_name").
//
// The fix: a toColumnName() helper now translates property -> column names for
// selectSelector, orderBySelectors, and every leaf selector key in
// parseCondition(). Internal discriminators (??table / ??sequence) are left
// untouched.
//

@uses("nano")
@table("colmap_q")
@model()
class ColumnMappedQueryModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @column("mapped_name")
  @required()
  name!: string;

  @column("mapped_value")
  @required()
  value!: number;

  constructor(arg?: ModelArg<ColumnMappedQueryModel>) {
    super(arg);
  }
}

describe("REGRESSION: querying @column-mapped fields by property name", () => {
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let repo: NanoRepository<ColumnMappedQueryModel>;

  beforeAll(async () => {
    resources = await createNanoTestResources("reg_colmap_query");
    adapter = new NanoAdapter({
      couchUser: resources.user,
      couchPassword: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
    await adapter.initialize();
    repo = nanoRepository(ColumnMappedQueryModel);

    await repo.createAll([
      new ColumnMappedQueryModel({ id: 1, name: "alpha", value: 10 }),
      new ColumnMappedQueryModel({ id: 2, name: "beta", value: 20 }),
      new ColumnMappedQueryModel({ id: 3, name: "gamma", value: 30 }),
    ]);

    // Create a CouchDB Mango index on the mapped column so orderBy can sort.
    const dbClient = (adapter as any).client;
    await dbClient.createIndex({
      index: { fields: ["mapped_value"] },
      name: "mapped_value_idx",
    });
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("select(['name','value']) projects mapped fields correctly", async () => {
    const results = await repo.select(["name", "value"]).execute();
    expect(results.length).toBe(3);
    const byName = (n: string) => results.find((r) => r.name === n)!;
    expect(byName("alpha").value).toBe(10);
    expect(byName("beta").value).toBe(20);
    expect(byName("gamma").value).toBe(30);
  });

  it("where(Condition.attribute('value').gt(15)) matches mapped column", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute("value").gt(15))
      .execute();
    expect(results.length).toBe(2);
    expect(results.map((r) => r.id).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("where(Condition.attribute('name').eq('beta')) matches mapped column", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute("name").eq("beta"))
      .execute();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(2);
  });

  it("findBy('name', 'gamma') matches mapped column", async () => {
    const results = await repo.findBy("name", "gamma");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(3);
  });

  it("orderBy('value') sorts on the mapped column", async () => {
    const results = await repo
      .select()
      .orderBy("value", OrderDirection.DSC)
      .execute();
    expect(results.map((r) => r.id)).toEqual([3, 2, 1]);
  });
});
