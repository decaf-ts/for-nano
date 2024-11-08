import {
  BaseModel,
  Condition,
  index,
  OrderDirection,
  pk,
  Repository,
  uses,
} from "@decaf-ts/core";
import {
  min,
  minlength,
  Model,
  model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { ServerScope } from "nano";
import {
  ConflictError,
  InternalError,
  readonly,
} from "@decaf-ts/db-decorators";
import { CouchDBAdapter, wrapDocumentScope } from "@decaf-ts/for-couchdb";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "queries_db";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Queries", () => {
  let con: ServerScope;
  let adapter: CouchDBAdapter;

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
  class TestUser extends BaseModel {
    @pk({ type: "Number" })
    id!: number;

    @required()
    @min(18)
    @index([OrderDirection.DSC, OrderDirection.ASC])
    age!: number;

    @required()
    @minlength(5)
    name!: string;

    @required()
    @readonly()
    @type([String.name])
    sex!: "M" | "F";

    constructor(arg?: ModelArg<TestUser>) {
      super(arg);
    }
  }

  let created: TestUser[];

  it("Creates in bulk", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const models = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
      (i) =>
        new TestUser({
          age: Math.floor(18 + (i - 1) / 3),
          name: "user_name_" + i,
          sex: i % 2 === 0 ? "M" : "F",
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestUser)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("Performs simple queries - full object", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const selected = await repo.select().execute<TestUser[]>();
    expect(
      created.every((c) => c.equals(selected.find((s: any) => (s.id = c.id))))
    );
  });

  it("Performs simple queries - attributes only", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const selected = await repo
      .select(["age", "sex"])
      .execute<{ age: number; sex: "M" | "F" }[]>();
    expect(selected).toEqual(
      expect.arrayContaining(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [...new Array(created.length)].map((e) =>
          expect.objectContaining({
            age: expect.any(Number),
            sex: expect.stringMatching(/^M|F$/g),
          })
        )
      )
    );
  });

  it("Performs conditional queries - full object", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute("age").eq(20);
    const selected = await repo.select().where(condition).execute<TestUser[]>();
    expect(selected.length).toEqual(created.filter((c) => c.age === 20).length);
  });

  it("Performs conditional queries - selected attributes", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute("age").eq(20);
    const selected = await repo
      .select(["age", "sex"])
      .where(condition)
      .execute<TestUser[]>();
    expect(selected.length).toEqual(created.filter((c) => c.age === 20).length);
    expect(selected).toEqual(
      expect.arrayContaining(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [...new Array(created.length)].map((e: any) =>
          expect.objectContaining({
            age: expect.any(Number),
            sex: expect.stringMatching(/^M|F$/g),
          })
        )
      )
    );
  });

  it("Performs AND conditional queries - full object", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute("age")
      .eq(20)
      .and(Condition.attribute("sex").eq("M"));
    const selected = await repo.select().where(condition).execute<TestUser[]>();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 && c.sex === "M").length
    );
  });

  it("Performs OR conditional queries - full object", async () => {
    const repo = Repository.forModel<TestUser, NanoRepository<TestUser>>(
      TestUser
    );
    const condition = Condition.attribute("age")
      .eq(20)
      .or(Condition.attribute("age").eq(19));
    const selected = await repo.select().where(condition).execute<TestUser[]>();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 || c.age === 19).length
    );
  });

  it("fails to Sorts attribute without indexes", async () => {
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    await expect(() =>
      repo.select().orderBy(["name", OrderDirection.DSC]).execute<TestUser[]>()
    ).rejects.toThrow(InternalError);
  });

  it("Sorts attribute when indexed", async () => {
    await adapter.initialize();
    const repo: NanoRepository<TestUser> = Repository.forModel<
      TestUser,
      NanoRepository<TestUser>
    >(TestUser);
    const sorted = await repo
      .select()
      .orderBy(["age", OrderDirection.DSC])
      .execute<TestUser[]>();
    expect(sorted).toBeDefined();
    expect(sorted.length).toEqual(created.length);

    expect(sorted[sorted.length - 1]).toEqual(
      expect.objectContaining(created[0])
    );

    expect(
      sorted.reverse().every((s: any, i: number) => s.equals(created[i]))
    ).toEqual(true);
  });
});
