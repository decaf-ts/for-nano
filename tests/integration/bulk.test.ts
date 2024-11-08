import { BaseModel, pk, Repository, uses } from "@decaf-ts/core";
import {
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { ServerScope } from "nano";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { wrapDocumentScope } from "@decaf-ts/for-couchdb";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "bulk_db";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Bulk operations", () => {
  let con: ServerScope;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: NanoAdapter;

  beforeAll(async () => {
    con = NanoAdapter.connect(admin, admin_password, dbHost);
    expect(con).toBeDefined();
    try {
      await NanoAdapter.createDatabase(con, dbName);
      await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    con = NanoAdapter.connect(user, user_password, dbHost);
    adapter = new NanoAdapter(
      wrapDocumentScope(con, dbName, user, user_password),
      "nano"
    );
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  @uses("nano")
  @model()
  class TestBulkModel extends BaseModel {
    @pk({ type: "Number" })
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
