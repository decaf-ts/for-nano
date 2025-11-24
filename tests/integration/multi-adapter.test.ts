import { Metadata } from "@decaf-ts/decoration";
import { TestCountryModel } from "./models";
console.log(`before all: ${Metadata.flavourOf(TestCountryModel)}`);
import { Adapter, RamAdapter, RamFlavour } from "@decaf-ts/core";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

console.log(`After ram: ${Metadata.flavourOf(TestCountryModel)}`);
import { ServerScope } from "nano";
import { Observer, PersistenceKeys } from "@decaf-ts/core";
import { CouchDBRepository } from "@decaf-ts/for-couchdb";
import { Model } from "@decaf-ts/decorator-validation";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter, NanoFlavour } from "../../src";
import { NanoRepository } from "../../src";
import { TestCountryModel } from "./models";
console.log(`After nano: ${Metadata.flavourOf(TestCountryModel)}`);

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "test_db_multi";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("multi adapter", () => {
  let con: ServerScope;
  let adapter: NanoAdapter;
  let repo: NanoRepository<TestCountryModel>;

  beforeAll(async () => {
    expect(Metadata.flavourOf(TestCountryModel)).toEqual(NanoFlavour);
    con = await NanoAdapter.connect(admin, admin_password, dbHost);
    expect(con).toBeDefined();
    try {
      await NanoAdapter.createDatabase(con, dbName);
      await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    adapter = new NanoAdapter({
      user: user,
      password: user_password,
      host: dbHost,
      dbName: dbName,
    });
    repo = new CouchDBRepository(adapter, TestCountryModel);
  });

  let observer: Observer;
  let mock: any;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();
    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    repo.observe(observer);
  });

  afterEach(() => {
    repo.unObserve(observer);
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  let created: TestCountryModel, updated: TestCountryModel;

  it("creates", async () => {
    const model = new TestCountryModel({
      name: "test country",
      countryCode: "tst",
      locale: "ts_TS",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
    const metadata = (created as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // expect(mock).toHaveBeenCalledWith(
    //   Repository.table(TestModel),
    //   OperationKeys.CREATE,
    //   [model.id]
    // );
  });

  it("reads", async () => {
    const read = await repo.read(created.id as number);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
    const metadata = (read as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("updates", async () => {
    const toUpdate = new TestCountryModel(
      Object.assign({}, created, {
        name: "new_test_name",
      })
    );

    updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(
      updated.equals(created, "updatedAt", "updatedOn", "name")
    ).toEqual(true); // minus the expected changes
    const metadata = (updated as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as number);
    expect(deleted).toBeDefined();
    expect(deleted.equals(updated)).toEqual(true);

    await expect(repo.read(created.id as number)).rejects.toThrowError(
      NotFoundError
    );

    const metadata = (deleted as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });
});
