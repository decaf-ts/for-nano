import { NanoAdapter, NanoRepository } from "../../src";
import { ServerScope } from "nano";
import {
  BaseModel,
  Condition,
  createdAt,
  index,
  OrderDirection,
  pk,
  Repository,
  updatedAt,
} from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  date,
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { ConflictError } from "@decaf-ts/db-decorators";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "queries_date_db";
const dbHost = "localhost:10010";
const dayInMs = 24 * 60 * 60 * 1000;
const startTimestamp = Date.UTC(2024, 0, 1);

const con: ServerScope = NanoAdapter.connect(admin, admin_password, dbHost);
const adapter = new NanoAdapter({
  user: user,
  password: user_password,
  host: dbHost,
  dbName: dbName,
  protocol: "http",
});

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Queries with dates", () => {
  beforeAll(async () => {
    expect(con).toBeDefined();
    try {
      await NanoAdapter.createDatabase(con, dbName);
      await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    await adapter.initialize();
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  @uses("nano")
  @model()
  class TestObject extends BaseModel {
    @pk()
    id!: number;

    @required()
    @minlength(5)
    @index([OrderDirection.ASC, OrderDirection.DSC])
    name!: string;

    @date()
    @index([OrderDirection.ASC, OrderDirection.DSC])
    ts!: Date;

    @createdAt()
    @index([OrderDirection.ASC, OrderDirection.DSC])
    createdAt!: Date;

    @updatedAt()
    @index([OrderDirection.ASC, OrderDirection.DSC])
    updatedAt!: Date;

    constructor(arg?: ModelArg<TestObject>) {
      super(arg);
    }
  }

  const toTimestamp = (offsetDays: number) =>
    new Date(startTimestamp + offsetDays * dayInMs);
  let created: TestObject[];

  it("Creates in bulk", async () => {
    const repo: NanoRepository<TestObject> = Repository.forModel<
      TestObject,
      NanoRepository<TestObject>
    >(TestObject);
    const models = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
      (i) =>
        new TestObject({
          name: "user_name_" + i,
          ts: toTimestamp(i - 1),
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.length).toEqual(models.length);
    expect(created.every((el) => el.ts instanceof Date)).toEqual(true);
  });

  it("Selects all models without filters", async () => {
    const repo: NanoRepository<TestObject> = Repository.forModel(TestObject);
    const selected = await repo.select().execute();
    expect(selected.length).toEqual(created.length);
    expect(selected.every((s) => s instanceof TestObject)).toEqual(true);
  });

  it("Filters records with ts before a pivot date", async () => {
    const pivot = toTimestamp(4);
    const condition = Condition.attribute<TestObject>("ts").lt(pivot);
    const repo = Repository.forModel<TestObject, NanoRepository<TestObject>>(
      TestObject
    );
    const selected = await repo.select().where(condition).execute();
    const expected = created.filter(
      (el) => el.ts.getTime() < pivot.getTime()
    ).length;
    expect(selected.length).toEqual(expected);
    expect(selected.every((el) => el.ts.getTime() < pivot.getTime())).toEqual(
      true
    );
  });

  it("Filters records with ts after or equal to a pivot", async () => {
    const pivot = toTimestamp(5);
    const condition = Condition.attribute<TestObject>("ts").gte(pivot);
    const repo = Repository.forModel<TestObject, NanoRepository<TestObject>>(
      TestObject
    );
    const selected = await repo.select().where(condition).execute();
    const expected = created.filter(
      (el) => el.ts.getTime() >= pivot.getTime()
    ).length;
    expect(selected.length).toEqual(expected);
    expect(selected.every((el) => el.ts.getTime() >= pivot.getTime())).toEqual(
      true
    );
  });

  it("Applies a date range filter and selects only the name attribute", async () => {
    const from = toTimestamp(2);
    const to = toTimestamp(7);
    const condition = Condition.attribute<TestObject>("ts")
      .gte(from)
      .and(Condition.attribute<TestObject>("ts").lte(to));
    const repo = Repository.forModel<TestObject, NanoRepository<TestObject>>(
      TestObject
    );
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(
      created.filter(
        (el) =>
          el.ts.getTime() >= from.getTime() && el.ts.getTime() <= to.getTime()
      ).length
    );
    expect(
      selected.every(
        (el) =>
          typeof el.name === "string" &&
          el.name.startsWith("user_name_") &&
          el.ts instanceof Date
      )
    ).toEqual(true);
  });

  it("Orders by ts and verifies the bounds of the first and last entries", async () => {
    const repo = Repository.forModel<TestObject, NanoRepository<TestObject>>(
      TestObject
    );
    const selected = await repo
      .select()
      .orderBy(["ts", OrderDirection.ASC])
      .execute();
    expect(selected.length).toEqual(created.length);
    expect(selected[0].ts.getTime()).toEqual(created[0].ts.getTime());
    expect(selected[selected.length - 1].ts.getTime()).toEqual(
      created[created.length - 1].ts.getTime()
    );
  });

  it("deletes them all", async () => {
    const repo = Repository.forModel<TestObject, NanoRepository<TestObject>>(
      TestObject
    );

    const models = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const deleted = await repo.deleteAll(models);
    expect(deleted).toBeDefined();
    expect(Array.isArray(deleted)).toEqual(true);
  });
});
