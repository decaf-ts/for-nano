import { Model, model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  Adapter,
  BaseModel,
  Condition,
  column,
  pk,
  Repository,
  table,
} from "@decaf-ts/core";
import { NanoAdapter, NanoRepository } from "../../src";
import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";

const describeExists =
  process.env.RUN_METHOD_QUERY_BUILDER === "true" ? describe : describe.skip;

Adapter.setCurrent("nano");
Model.setBuilder(Model.fromModel);

jest.setTimeout(85000);

@uses("nano")
@table("exists_mixed_dataset_model")
@model()
class ExistsMixedModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("nickname")
  nickname?: string;

  constructor(arg?: any) {
    super(arg);
  }
}

const WITH_NICKNAME = ["n1", "n2", "n3", "n4", "n5", "n6"];
const WITHOUT_NICKNAME = ["x1", "x2", "x3", "x4"];

describeExists("EXISTS select returns the full list (mixed dataset)", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let adapter: NanoAdapter;
  let repo: NanoRepository<ExistsMixedModel>;

  beforeAll(async () => {
    resources = await createNanoTestResources("exists_mixed");
    adapter = new NanoAdapter({
      couchUser: resources.user,
      couchPassword: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: "http",
    });
    adapter["index"](ExistsMixedModel);

    repo = Repository.forModel<ExistsMixedModel, NanoRepository<ExistsMixedModel>>(
      ExistsMixedModel
    );

    await repo.createAll([
      ...WITH_NICKNAME.map(
        (id) =>
          new ExistsMixedModel({ id, name: `name_${id}`, nickname: `nick_${id}` })
      ),
      ...WITHOUT_NICKNAME.map(
        (id) => new ExistsMixedModel({ id, name: `name_${id}` })
      ),
    ]);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  function ids(records: any[]): string[] {
    return records.map((r) => r.id).sort();
  }

  it("returns the full positive list on the default path", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists())
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITH_NICKNAME].sort());
  });

  it("returns the full negated list on the default path", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists(false))
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITHOUT_NICKNAME].sort());
  });

  it("returns the full positive list under forcePrepareSimpleQueries", async () => {
    const results = await repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists())
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITH_NICKNAME].sort());
  });

  it("returns the full negated list under forcePrepareSimpleQueries", async () => {
    const results = await repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists(false))
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITHOUT_NICKNAME].sort());
  });

  it("returns the full positive list under forcePrepareComplexQueries", async () => {
    const results = await repo
      .override({ forcePrepareComplexQueries: true })
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists())
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITH_NICKNAME].sort());
  });

  it("keeps list semantics for a complex AND containing an EXISTS leg", async () => {
    const results = await repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(
        Condition.attribute<ExistsMixedModel>("nickname")
          .exists()
          .and(Condition.attribute<ExistsMixedModel>("name").exists())
      )
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(ids(results)).toEqual([...WITH_NICKNAME].sort());
  });

  it("pages the EXISTS select under the forced path", async () => {
    const paginator = await repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsMixedModel>("nickname").exists())
      .paginate(2);

    const page1 = await paginator.page(1);
    expect(Array.isArray(page1)).toBe(true);
    expect(page1.length).toBe(2);
    expect(paginator.current).toBe(1);
  });

  it("keeps Repository.existsOf / existsNotOf boolean", async () => {
    await expect(repo.existsOf("nickname")).resolves.toBe(true);
    await expect(repo.existsNotOf("nickname")).resolves.toBe(true);
    await expect(repo.existsOf("name")).resolves.toBe(true);
    await expect(repo.existsNotOf("name")).resolves.toBe(false);
  });
});
