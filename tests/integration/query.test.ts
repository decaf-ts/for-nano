import { NanoAdapter, NanoRepository } from "../../src";
import { createNanoTestResources, cleanupNanoTestResources } from "../helpers/nano";
import { nanoRepository } from "../helpers/repository";
import { setupNanoAdapter } from "../helpers/nanoSetup";

import {
  BaseModel,
  Condition,
  Context,
  defaultQueryAttr,
  index,
  OrderDirection,
  pk,
} from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  min,
  minlength,
  Model,
  model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { InternalError, readonly } from "@decaf-ts/db-decorators";


Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Queries", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let adapter: NanoAdapter;

  @uses("nano")
  @model()
  class TestUser extends BaseModel {
    @pk({ type: Number })
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
    @type([String])
    sex!: "M" | "F";

    constructor(arg?: ModelArg<TestUser>) {
      super(arg);
    }
  }

  let created: TestUser[];

  it("Creates in bulk", async () => {
    const repo = nanoRepository(TestUser);
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

  beforeAll(async () => {
    resources = await createNanoTestResources("queries");
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("Performs simple queries - full object", async () => {
    const repo = nanoRepository(TestUser);
    const selected = await repo.select().execute();
    expect(
      created.every((c) => c.equals(selected.find((s: any) => (s.id = c.id))))
    );
  });

  it("Performs simple queries - attributes only", async () => {
    const repo = nanoRepository(TestUser);
    const selected = await repo.select(["age", "sex"]).execute();
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
    const repo = nanoRepository(TestUser);
    const condition = Condition.attribute<TestUser>("age").eq(20);
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(created.filter((c) => c.age === 20).length);
  });

  it("Performs conditional queries - selected attributes", async () => {
    const repo = nanoRepository(TestUser);
    const condition = Condition.attribute<TestUser>("age").eq(20);
    const selected = await repo
      .select(["age", "sex"])
      .where(condition)
      .execute();
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
    const repo = nanoRepository(TestUser);
    const condition = Condition.attribute<TestUser>("age")
      .eq(20)
      .and(Condition.attribute<TestUser>("sex").eq("M"));
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 && c.sex === "M").length
    );
  });

  it("Performs OR conditional queries - full object", async () => {
    const repo = nanoRepository(TestUser);
    const condition = Condition.attribute<TestUser>("age")
      .eq(20)
      .or(Condition.attribute<TestUser>("age").eq(19));
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 || c.age === 19).length
    );
  });

  it("fails to Sorts attribute without indexes", async () => {
    const repo = nanoRepository(TestUser);
    await expect(() =>
      repo.select().orderBy(["name", OrderDirection.DSC]).execute()
    ).rejects.toThrow(InternalError);
  });

  it("Sorts attribute when indexed", async () => {
    await adapter.initialize();
    const repo = nanoRepository(TestUser);
    const sorted = await repo
      .select()
      .orderBy(["age", OrderDirection.DSC])
      .execute();
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

@uses("nano")
@model()
class DefaultStringQueryModel extends BaseModel {
  @pk({ type: Number })
  id?: number = undefined;

  @required()
  @defaultQueryAttr()
  attr1?: string = undefined;

  @required()
  @defaultQueryAttr()
  attr2?: string = undefined;

  constructor(arg?: ModelArg<DefaultStringQueryModel>) {
    super(arg);
  }
}

describe("default query statements on nano", () => {
  let setupData: Awaited<ReturnType<typeof setupNanoAdapter>>;
  let stringRepo: NanoRepository<DefaultStringQueryModel>;

  beforeAll(async () => {
    setupData = await setupNanoAdapter("default_query_strings");
    stringRepo = new NanoRepository(setupData.adapter, DefaultStringQueryModel);
    const models = [
      new DefaultStringQueryModel({ attr1: "apple", attr2: "zebra" }),
      new DefaultStringQueryModel({ attr1: "apricot", attr2: "amber" }),
      new DefaultStringQueryModel({ attr1: "banana", attr2: "aurora" }),
      new DefaultStringQueryModel({ attr1: "delta", attr2: "aardvark" }),
      new DefaultStringQueryModel({ attr1: "omega", attr2: "alpha" }),
      new DefaultStringQueryModel({ attr1: "sigma", attr2: "altitude" }),
    ];
    await stringRepo.createAll(models);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(setupData.resources);
  });

  it("finds matches using decorated default attributes", async () => {
    const matches = await stringRepo.find("ap", OrderDirection.ASC);
    expect(matches.map((record) => record.attr1)).toEqual([
      "apple",
      "apricot",
    ]);
    expect(
      matches.every(
        (record) =>
          record.attr1?.startsWith("ap") || record.attr2?.startsWith("ap")
      )
    ).toEqual(true);
  });

  it("pages defaults using decorated attributes and consistent metadata", async () => {
    const pageResult = await stringRepo.page("a", OrderDirection.DSC, {
      offset: 1,
      limit: 2,
    });

    expect(pageResult.current).toEqual(1);
    expect(pageResult.count).toEqual(6);
    expect(pageResult.total).toEqual(3);
    expect(
      pageResult.data.every(
        (record) =>
          record.attr1?.startsWith("a") || record.attr2?.startsWith("a")
      )
    ).toEqual(true);
    expect(pageResult.data.map((record) => record.attr1)).toEqual([
      "sigma",
      "omega",
    ]);
  });

  it("includes matches from non-primary default attributes and keeps ordering consistent", async () => {
    const ascMatches = await stringRepo.find("al", OrderDirection.ASC);
    const descMatches = await stringRepo.find("al", OrderDirection.DSC);

    expect(ascMatches.map((record) => record.attr1)).toEqual([
      "omega",
      "sigma",
    ]);
    expect(descMatches.map((record) => record.attr1)).toEqual([
      "sigma",
      "omega",
    ]);
    expect(
      ascMatches.every((record) => record.attr2?.startsWith("al"))
    ).toEqual(true);
    expect(
      descMatches.every((record) => record.attr2?.startsWith("al"))
    ).toEqual(true);

    const ascPage = await stringRepo.page("al", OrderDirection.ASC, {
      offset: 1,
      limit: 1,
    });
    expect(ascPage.data.map((record) => record.attr1)).toEqual(["omega"]);

    const descPage = await stringRepo.page("al", OrderDirection.DSC, {
      offset: 1,
      limit: 1,
    });
    expect(descPage.data.map((record) => record.attr1)).toEqual(["sigma"]);
  });
});

@uses("nano")
@model()
class NumericSearchModel extends BaseModel {
  @pk({ type: Number })
  id?: number = undefined;

  @required()
  @defaultQueryAttr()
  searchName?: string = undefined;

  @required()
  @defaultQueryAttr()
  searchCode?: string = undefined;

  constructor(arg?: ModelArg<NumericSearchModel>) {
    super(arg);
  }
}

describe("default query statements with numeric strings on nano", () => {
  const queryValue = "1";
const expectedAscNames = [
  "10Start",
  "1Alpha",
  "1Beta",
  "1Zeta",
  "a1-Gamma",
  "foo10",
];
const expectedDescNames = [...expectedAscNames].reverse();

  let setupData: Awaited<ReturnType<typeof setupNanoAdapter>>;
  let numericRepo: NanoRepository<NumericSearchModel>;
  const bookmarkCtx = new Context().accumulate({
    paginateByBookmark: true,
  });

  beforeAll(async () => {
    setupData = await setupNanoAdapter("default_query");
    numericRepo = new NanoRepository(setupData.adapter, NumericSearchModel);
    const models = [
      new NumericSearchModel({
        searchName: "10Start",
        searchCode: "10-Start",
      }),
      new NumericSearchModel({
        searchName: "1Alpha",
        searchCode: "1-Alpha",
      }),
      new NumericSearchModel({
        searchName: "1Beta",
        searchCode: "1-Beta",
      }),
      new NumericSearchModel({
        searchName: "1Zeta",
        searchCode: "1-Zeta",
      }),
      new NumericSearchModel({
        searchName: "a1-Gamma",
        searchCode: "1-Gamma",
      }),
      new NumericSearchModel({
        searchName: "foo10",
        searchCode: "10-Foo",
      }),
      new NumericSearchModel({
        searchName: "alpha10",
        searchCode: "alpha-10",
      }),
      new NumericSearchModel({
        searchName: "2Delta",
        searchCode: "2-Delta",
      }),
    ];
    await numericRepo.createAll(models);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(setupData.resources);
  });

  it("finds numeric-prefixed strings via decorated attributes and maintains consistent ordering", async () => {
    const ascMatches = await numericRepo.find(queryValue, OrderDirection.ASC);
    const descMatches = await numericRepo.find(queryValue, OrderDirection.DSC);

    expect(ascMatches.map((record) => record.searchName)).toEqual(
      expectedAscNames
    );
    expect(descMatches.map((record) => record.searchName)).toEqual(
      expectedDescNames
    );
    expect(
      ascMatches.every(
        (record) =>
          record.searchName?.startsWith(queryValue) ||
          record.searchCode?.startsWith(queryValue)
      )
    ).toEqual(true);
    expect(
      descMatches.every(
        (record) =>
          record.searchName?.startsWith(queryValue) ||
          record.searchCode?.startsWith(queryValue)
      )
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "a1-Gamma")
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "foo10")
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "alpha10")
    ).toEqual(false);
  });

  it("pages numeric-prefixed data across sequential page offsets", async () => {
    const pageLimit = 2;
    const expectedAscPages = [
      ["10Start", "1Alpha"],
      ["1Beta", "1Zeta"],
      ["a1-Gamma", "foo10"],
    ];

    const repoPage1 = await numericRepo.page(queryValue, OrderDirection.ASC, {
      offset: 1,
      limit: pageLimit,
    });
    const pageOneLastId = repoPage1.data[repoPage1.data.length - 1].id as number;
    const repoPage2 = await numericRepo.page(
      queryValue,
      OrderDirection.ASC,
      {
        limit: pageLimit,
        bookmark: pageOneLastId,
      },
      bookmarkCtx
    );
    const pageTwoLastId = repoPage2.data[repoPage2.data.length - 1].id as number;
    const repoPage3 = await numericRepo.page(
      queryValue,
      OrderDirection.ASC,
      {
        limit: pageLimit,
        bookmark: pageTwoLastId,
      },
      bookmarkCtx
    );

    const repoAscNames = [
      repoPage1.data.map((record) => record.searchName),
      repoPage2.data.map((record) => record.searchName),
      repoPage3.data.map((record) => record.searchName),
    ];

    expect(repoAscNames).toEqual(expectedAscPages);
  });

  it("pages numeric defaults in both directions with consistent metadata", async () => {
    const pageLimit = 2;
    const ascPage = await numericRepo.page(queryValue, OrderDirection.ASC, {
      offset: 1,
      limit: pageLimit,
    });

    expect(ascPage.current).toEqual(1);
    expect(ascPage.count).toEqual(expectedAscNames.length);
    expect(ascPage.total).toEqual(Math.ceil(expectedAscNames.length / pageLimit));
    expect(ascPage.data.map((record) => record.searchName)).toEqual(
      expectedAscNames.slice(0, pageLimit)
    );

    const pageOneLastId = ascPage.data[ascPage.data.length - 1].id as number;
    const ascPageTwo = await numericRepo.page(
      queryValue,
      OrderDirection.ASC,
      {
        limit: pageLimit,
        bookmark: pageOneLastId,
      },
      bookmarkCtx
    );
    expect(ascPageTwo.data.map((record) => record.searchName)).toEqual(
      expectedAscNames.slice(pageLimit, pageLimit * 2)
    );

    const descPage = await numericRepo.page(queryValue, OrderDirection.DSC, {
      offset: 1,
      limit: pageLimit,
    });
    expect(descPage.current).toEqual(1);
    expect(descPage.count).toEqual(expectedAscNames.length);
    expect(descPage.total).toEqual(Math.ceil(expectedAscNames.length / pageLimit));
    expect(descPage.data.map((record) => record.searchName)).toEqual(
      expectedDescNames.slice(0, pageLimit)
    );
  });
});
