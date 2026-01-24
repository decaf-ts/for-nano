import { ServerScope } from "nano";
import {
  BaseModel,
  Condition,
  OrderDirection,
  pk,
  Repository,
  table,
} from "@decaf-ts/core";
import { count, distinct, groupBy, max, min, sum } from "@decaf-ts/for-couchdb";
import { ConflictError } from "@decaf-ts/db-decorators";
import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { NanoAdapter } from "../../src";
import { NanoFlavour } from "../../src/constants";

Model.setBuilder(Model.fromModel);

const admin = "couchdb.admin";
const adminPassword = "couchdb.admin";
const user = "couchdb.admin";
const userPassword = "couchdb.admin";
const dbName = "test_repository_aggregate";
const dbHost = "localhost:10010";

@uses(NanoFlavour)
@table("aggregate_products")
@model()
class AggregateProduct extends BaseModel {
  @pk({ type: String })
  productCode!: string;

  @required()
  @count()
  @distinct()
  @groupBy()
  inventedName!: string;

  @required()
  nameMedicinalProduct!: string;

  @required()
  @count()
  @sum()
  @max()
  @min()
  counter!: number;

  @min()
  @max()
  launchDate!: Date;

  constructor(arg?: ModelArg<AggregateProduct>) {
    super(arg);
  }
}

const idAttribute = Model.pk(AggregateProduct);

describe("Nano repository aggregate operations", () => {
  let con: ServerScope;
  let adapter: NanoAdapter;
  let repo: Repository<AggregateProduct, any>;
  let bulk: AggregateProduct[];

  beforeAll(async () => {
    con = await NanoAdapter.connect(admin, adminPassword, dbHost);
    try {
      await NanoAdapter.createDatabase(con, dbName);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    try {
      await NanoAdapter.createUser(con, dbName, user, userPassword);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }

    adapter = new NanoAdapter({
      user,
      password: userPassword,
      host: dbHost,
      dbName,
      protocol: "http",
    });
    await adapter.initialize();
    repo = Repository.forModel(AggregateProduct);

    const models = Array.from({ length: 20 }).map((_, index) => {
      return new AggregateProduct({
        productCode: `prod-${index}`,
        inventedName: `name${index % 5}`,
        nameMedicinalProduct: `medicine${index}`,
        counter: index,
        launchDate: new Date(2024, 0, index + 1),
      });
    });
    bulk = await repo.createAll(models);
  });

  afterAll(async () => {
    if (bulk && bulk.length) {
      const keys = bulk.map((b) => b[idAttribute] as string);
      await repo.deleteAll(keys);
    }
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  describe("COUNT operations", () => {
    it("counts all records", async () => {
      const countAll = await repo.count().execute();
      expect(countAll).toBe(20);
    });

    it("counts non-null values of an attribute", async () => {
      const count = await repo.count("inventedName" as any).execute();
      expect(count).toBe(20);
    });

    it("applies a where condition before counting", async () => {
      const count = await repo
        .count()
        .where(Condition.attr<AggregateProduct>("counter" as any).gt(15))
        .execute();
      expect(count).toBe(4);
    });
  });

  describe("COUNT DISTINCT operations", () => {
    it("counts distinct values of an attribute", async () => {
      const countDistinct = await repo
        .count("inventedName" as any)
        .distinct()
        .execute();
      expect(countDistinct).toBe(5);
    });

    it("counts distinct values with a filter", async () => {
      const countDistinct = await repo
        .count("inventedName" as any)
        .distinct()
        .where(Condition.attr<AggregateProduct>("counter" as any).lt(10))
        .execute();
      expect(countDistinct).toBe(5);
    });
  });

  describe("MIN/MAX/SUM/AVG operations", () => {
    it("finds the minimum and maximum of numeric values", async () => {
      const minValue = await repo.min("counter" as any).execute();
      const maxValue = await repo.max("counter" as any).execute();
      expect(minValue).toBe(0);
      expect(maxValue).toBe(19);
    });

    it("sums numeric values", async () => {
      const sumValue = await repo.sum("counter" as any).execute();
      expect(sumValue).toBe(190);
    });

    it("averages numeric values", async () => {
      const avgValue = await repo.avg("counter" as any).execute();
      expect(avgValue).toBeCloseTo(9.5);
    });

    it("finds the minimum and maximum dates", async () => {
      const minDate = await repo.min("launchDate" as any).execute();
      const maxDate = await repo.max("launchDate" as any).execute();
      expect(minDate).toEqual(new Date(2024, 0, 1));
      expect(maxDate).toEqual(new Date(2024, 0, 20));
    });
  });

  describe("DISTINCT operations", () => {
    it("returns the unique values of an attribute", async () => {
      const distinctValues = await repo
        .distinct("inventedName" as any)
        .execute();
      expect(distinctValues.sort()).toEqual([
        "name0",
        "name1",
        "name2",
        "name3",
        "name4",
      ]);
    });

    it("filters before returning distinct values", async () => {
      const distinctValues = await repo
        .distinct("inventedName" as any)
        .where(Condition.attr<AggregateProduct>("counter" as any).lt(6))
        .execute();
      expect(distinctValues.sort()).toEqual(["name0", "name1", "name2"]);
    });
  });

  describe("Condition operators", () => {
    it("filters records with BETWEEN", async () => {
      const results = await repo
        .select()
        .where(
          Condition.attr<AggregateProduct>("counter" as any).between(5, 10)
        )
        .orderBy(["counter", OrderDirection.ASC])
        .execute();
      expect(results.map((r) => r.counter)).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it("filters with IN operator", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<AggregateProduct>("counter" as any).in([2, 5, 7]))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();
      expect(results.map((r) => r.counter)).toEqual([2, 5, 7]);
    });
  });

  describe("Ordering and pagination", () => {
    it("respects orderBy and limit", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.DSC])
        .limit(3)
        .execute();
      expect(results.map((r) => r.counter)).toEqual([19, 18, 17]);
    });

    it("applies offset", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .limit(3)
        .offset(10)
        .execute();
      expect(results.map((r) => r.counter)).toEqual([10, 11, 12]);
    });
  });

  describe("GroupBy operations", () => {
    it("groups records by attribute", async () => {
      const grouped = await repo
        .select()
        .groupBy("inventedName" as any)
        .execute();
      const keys = Object.keys(grouped).sort();
      expect(keys).toEqual(["name0", "name1", "name2", "name3", "name4"]);
      keys.forEach((key) => {
        expect((grouped as any)[key]).toHaveLength(4);
      });
    });
  });
});
