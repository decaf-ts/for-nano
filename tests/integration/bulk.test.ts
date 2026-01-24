import { BaseModel, PersistenceKeys, pk, Repository } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { ServerScope } from "nano";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";
import { createNanoTestResources } from "../helpers/nano";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Bulk operations", () => {
  let con: ServerScope;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  beforeAll(async () => {
    resources = await createNanoTestResources("bulk");
    con = resources.connection;
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, resources.dbName);
  });

  @uses("nano")
  @model()
  class TestBulkModel extends BaseModel {
    @pk({ type: Number })
    id?: number = undefined;

    @required()
    @minlength(5)
    attr1?: string = undefined;

    constructor(arg?: ModelArg<TestBulkModel>) {
      super(arg);
    }
  }

  let created: TestBulkModel[];
  let updated: TestBulkModel[];

  it.skip("creates one", async () => {
    const repo: NanoRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      NanoRepository<TestBulkModel>
    >(TestBulkModel);
    const created = await repo.create(
      new TestBulkModel({
        attr1: "attr1",
      })
    );
    expect(created).toBeDefined();
  });

  it("Creates in bulk", async () => {
    const repo: NanoRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      NanoRepository<TestBulkModel>
    >(TestBulkModel);
    const models = [1].map(
      (i) =>
        new TestBulkModel({
          attr1: "user_name_" + i,
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("Reads in Bulk", async () => {
    const repo: NanoRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      NanoRepository<TestBulkModel>
    >(TestBulkModel);
    const ids = created.map((c) => c.id) as number[];
    const read = await repo.readAll(ids);
    expect(read).toBeDefined();
    expect(Array.isArray(read)).toEqual(true);
    expect(read.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(read.every((el) => !el.hasErrors())).toEqual(true);
    expect(read.every((el, i) => el.equals(created[i]))).toEqual(true);
    expect(read.every((el) => !!(el as any)[PersistenceKeys.METADATA]));
  });

  it("Updates in Bulk", async () => {
    const repo: NanoRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      NanoRepository<TestBulkModel>
    >(TestBulkModel);
    const toUpdate = created.map((c, i) => {
      return new TestBulkModel({
        id: c.id,
        attr1: "updated_name_" + i,
      });
    });
    updated = await repo.updateAll(toUpdate);
    expect(updated).toBeDefined();
    expect(Array.isArray(updated)).toEqual(true);
    expect(updated.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(updated.every((el) => !el.hasErrors())).toEqual(true);
    expect(updated.every((el, i) => !el.equals(created[i]))).toEqual(true);
  });

  it("Deletes in Bulk", async () => {
    const repo: NanoRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      NanoRepository<TestBulkModel>
    >(TestBulkModel);
    const ids = created.map((c) => c.id);
    const deleted = await repo.deleteAll(ids as number[]);
    expect(deleted).toBeDefined();
    expect(Array.isArray(deleted)).toEqual(true);
    expect(deleted.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
    expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);
    for (const k in created.map((c) => c.id)) {
      await expect(repo.read(k)).rejects.toThrowError(NotFoundError);
    }
  });
});
