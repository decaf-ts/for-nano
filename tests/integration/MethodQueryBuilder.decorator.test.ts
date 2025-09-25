import { Model } from "@decaf-ts/decorator-validation";
import { OrderDirection, QueryError } from "@decaf-ts/core";
import { getRepo } from "./MethodQueryBuilderRepo";
import { NanoAdapter } from "../../src";
import type { ServerScope } from "nano";
import { ConflictError } from "@decaf-ts/db-decorators";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "adapter_raw_bulk_db";
const dbHost = "localhost:10010";

let con: ServerScope;
let adapter: NanoAdapter;
let userRepo: any;

jest.setTimeout(85000);

Model.setBuilder(Model.fromModel);

describe("Nano MethodQueryBuilder Decorator", () => {
  beforeAll(async () => {
    con = NanoAdapter.connect(admin, admin_password, dbHost);
    expect(con).toBeDefined();
    try {
      await NanoAdapter.createDatabase(con, dbName);
      // await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    adapter = new NanoAdapter({
      user: user,
      password: user_password,
      host: dbHost,
      dbName: dbName,
    });

    userRepo = getRepo(adapter);
    await userRepo.init();
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  describe("Operators", () => {
    it("should filter with Equals", async () => {
      const result = await userRepo.findByName("John Smith");
      expect(result.map((r) => r.name)).toEqual(["John Smith"]);
    });

    it("should filter with Diff", async () => {
      const result = await userRepo.findByCountryDiff("ON");
      expect(result.every((u) => u.country !== "ON")).toBe(true);
    });

    it("should filter with GreaterThan and LessThan", async () => {
      const result = await userRepo.findByAgeGreaterThanAndAgeLessThan(21, 25);
      expect(result.every((u) => u.age > 21 && u.age < 25)).toBe(true);
    });

    it("should filter with GreaterThanEqual and LessThanEqual", async () => {
      const result =
        await userRepo.findByAgeGreaterThanEqualAndAgeLessThanEqual(22, 24);
      expect(result.every((u) => u.age >= 22 && u.age <= 24)).toBe(true);
    });

    it("should filter with Between", async () => {
      const result = await userRepo.findByAgeBetween(25, 35);
      expect(result.every((u) => u.age >= 25 && u.age <= 35)).toBe(true);
    });

    it("should filter with True and False", async () => {
      const actives = await userRepo.findByActive(true);
      expect(actives.every((u) => u.active)).toBe(true);

      const inactives = await userRepo.findByActive(false);
      expect(inactives.every((u) => !u.active)).toBe(true);
    });

    it.skip("should filter with In", async () => {
      const result = await userRepo.findByCountryIn(["TH", "ON"]);
      expect(result.map((r) => r.country)).toEqual(
        expect.arrayContaining(["TH", "ON"])
      );
    });

    it("should filter with Matches (regex)", async () => {
      const result = await userRepo.findByNameMatches("^David");
      expect(result.every((u) => /^David/.test(u.name))).toBe(true);
    });

    it("should filter with Or", async () => {
      const result = await userRepo.findByNameEqualsOrAgeGreaterThan(
        "John Smith",
        27
      );
      expect(result.some((u) => u.name === "John Smith")).toBe(true);
      expect(result.some((u) => u.age > 27)).toBe(true);
    });
  });

  describe("OrderBy", () => {
    it("should order by name ascending", async () => {
      const orderByResult = await userRepo.findByActiveOrderByNameAsc(
        true,
        [["name", OrderDirection.ASC]],
        100
      );
      const names = orderByResult.map((r) => r.name);
      expect(names).toEqual([...names].sort());

      const noOrderByNames = (await userRepo.findByActive(true)).map(
        (r) => r.name
      );
      expect(noOrderByNames).not.toEqual(names);
    });

    it("should order by age desc then by country dsc", async () => {
      const orderByResult = await userRepo.findByActive(
        true,
        [
          ["age", OrderDirection.DSC],
          ["country", OrderDirection.DSC],
        ],
        100
      );

      const sorted = [...orderByResult].sort((a, b) => {
        if (a.age !== b.age) return b.age - a.age; // age desc
        return b.country.localeCompare(a.country); // country dsc
      });

      // const ages = orderByResult.map((r) => r.age);
      // const countries = orderByResult.map((r) => r.country);

      expect(orderByResult).toEqual(sorted);

      const noOrderByResult = await userRepo.findByActive(true);
      expect(noOrderByResult).not.toEqual(orderByResult);
    });
  });

  describe.skip("GroupBy", () => {
    it("should group by state", async () => {
      const result = await userRepo.findByActiveGroupByState(true);
      const groups = result.map((g) => g.group);
      expect(groups).toEqual(expect.arrayContaining([].map((d) => d.state)));
    });

    it.skip("should group by age then by state", async () => {
      const result = [];
      // await userRepo.findByAgeGreaterThanAndActiveGroupByAgeThenByStateOrderByAgeDescThenByCountryDsc(
      //   21,
      //   true,
      //   10
      // );
      expect(
        result.every((g) => g.items.every((i) => i.age > 21 && i.active))
      ).toBe(true);
    });
  });

  describe("Select", () => {
    it("should select only the specified fields", async () => {
      const selectedFields = ["name", "age"];
      const result = await userRepo.findByActiveThenSelectNameAndAge(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
      result.forEach((user) => {
        Object.keys(user).forEach((key) => {
          if (selectedFields.includes(key)) {
            expect(user[key]).not.toBeUndefined();
          } else {
            expect(user[key]).toBeUndefined();
          }
        });
      });
    });

    it("should select fields and apply limit", async () => {
      const selectedFields = ["name", "age"];
      const limitResult = await userRepo.findByActiveThenSelectNameAndAge(
        true,
        undefined,
        1
      );
      expect(limitResult.length).toEqual(1);
      limitResult.forEach((user) => {
        Object.keys(user).forEach((key) => {
          if (selectedFields.includes(key)) {
            expect(user[key]).not.toBeUndefined();
          } else {
            expect(user[key]).toBeUndefined();
          }
        });
      });
    });
  });

  describe("Limit", () => {
    it("should limit the number of results", async () => {
      const result = await userRepo.findByActive(true);
      expect(result.length).toBeGreaterThanOrEqual(2);

      const limitResult = await userRepo.findByActive(true, undefined, 1);
      expect(limitResult.length).toEqual(1);
    });
  });

  describe("Offset", () => {
    let allResult: any[];

    beforeAll(async () => {
      allResult = await userRepo.findByActive(true);
      expect(allResult.length).toBeGreaterThanOrEqual(3);
    });

    it("should offset the number of results", async () => {
      const offsetResult = await userRepo.findByActive(
        true,
        undefined,
        10,
        3 //allResult.length - 1
      );
      expect(offsetResult.length).toEqual(1);
    });

    describe("should offset and limit the number of results", () => {
      const cases = [
        { limit: 1, offset: 1 },
        { limit: 2, offset: 1 },
        { limit: 2, offset: 3 },
      ];

      cases.forEach(({ limit, offset }) => {
        it(`should return limit=${limit} and offset=${offset}`, async () => {
          const result = await userRepo.findByActive(
            true,
            undefined,
            limit,
            offset
          );

          expect(result.length).toBeLessThanOrEqual(limit);
          expect(result).toEqual(allResult.slice(offset, offset + limit));
        });
      });
    });
  });

  describe("Check options availability", () => {
    const cases = [
      {
        name: "orderBy",
        args: [10, [["age", OrderDirection.ASC]]],
        message: "OrderBy is not allowed for this query",
      },
      {
        name: "limit",
        args: [10, undefined, 1],
        message: "Limit is not allowed for this query",
      },
      {
        name: "offset",
        args: [10, undefined, undefined, 1],
        message: "Offset is not allowed for this query",
      },
    ];

    cases.forEach(({ name, args, message }) => {
      it(`should throw if ${name} not allowed`, async () => {
        try {
          await userRepo.findByAgeGreaterThanThenThrows(...args);
          fail(`Expected ${name} to throw but it did not`);
        } catch (err: any) {
          expect(err).toBeInstanceOf(QueryError);
          expect(err.message).toBe(new QueryError(message).message);
        }
      });
    });
  });
});
