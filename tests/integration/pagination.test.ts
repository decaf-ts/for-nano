import { Model } from "@decaf-ts/decorator-validation";
import { ServerScope } from "nano";
import { ConflictError, InternalError } from "@decaf-ts/db-decorators";
import { OrderDirection, Paginator, Repository } from "@decaf-ts/core";
import { TestCountryModel } from "./models";
import { wrapDocumentScope } from "@decaf-ts/for-couchdb";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "pagination_db";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

jest.setTimeout(500000);

describe(`Pagination`, function () {
  let con: ServerScope;
  let adapter: NanoAdapter;
  let repo: NanoRepository<TestCountryModel>;

  let created: TestCountryModel[];
  const size = 100;

  beforeAll(async () => {
    con = NanoAdapter.connect(admin, admin_password, dbHost);
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
    repo = new Repository(adapter, TestCountryModel);
    const models = Object.keys(new Array(size).fill(0)).map(
      (i) =>
        new TestCountryModel({
          name: "country" + (parseInt(i) + 1),
          countryCode: "pt",
          locale: "pt_PT",
        })
    );

    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(created.length).toEqual(size);
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  let selected: TestCountryModel[];
  it.skip("Fails to sort in an unindexed property", async () => {
    await expect(
      repo.select().orderBy(["id", OrderDirection.ASC]).execute()
    ).rejects.toThrow(InternalError);
  });

  it("indexes de database properly according to defined indexes", async () => {
    await adapter.initialize();
  });

  it("Sorts via defined property when there is an index", async () => {
    selected = await repo
      .select()
      .orderBy(["id", OrderDirection.ASC])
      .execute();
    expect(selected).toBeDefined();
    expect(selected.length).toEqual(created.length);
    expect(created.every((c, i) => c.equals(selected[i]))).toEqual(true);
  });

  it.skip("paginates", async () => {
    const paginator: Paginator<TestCountryModel> = await repo
      .select()
      .orderBy(["id", OrderDirection.DSC])
      .paginate(10);

    expect(paginator).toBeDefined();

    expect(paginator.size).toEqual(10);
    expect(paginator.current).toEqual(undefined);

    const page1 = await paginator.page();
    expect(page1).toBeDefined();

    const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];

    expect(page1.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids)
    );

    expect(paginator.current).toEqual(1);

    const page2 = await paginator.next();
    expect(page2).toBeDefined();

    expect(page2.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 10))
    );

    const page3 = await paginator.next();
    expect(page3).toBeDefined();

    expect(page3.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 20))
    );

    const page4 = await paginator.next();
    expect(page4).toBeDefined();

    expect(page4.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 30))
    );

    expect(() => paginator.count).toThrow();
    expect(() => paginator.total).toThrow();
  });
});
