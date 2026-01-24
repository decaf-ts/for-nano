import { NanoAdapter } from "../../src";
import {
  BaseModel,
  Condition,
  index,
  OrderDirection,
  pk,
} from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { NanoRepository } from "../../src/NanoRepository";
import { cleanupNanoTestResources } from "../helpers/nano";
import { setupNanoAdapter } from "../helpers/nanoSetup";
import { nanoRepository } from "../helpers/repository";

Model.setBuilder(Model.fromModel);

@uses("nano")
@model()
class LeaderboardEntry extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC], ["score"])
  category!: string;

  @required()
  score!: number;

  constructor(arg?: ModelArg<LeaderboardEntry>) {
    super(arg);
  }
}

jest.setTimeout(60000);

describe("NanoAdapter multi-level sorting", () => {
  let repo: NanoRepository<LeaderboardEntry>;
  let setup: Awaited<ReturnType<typeof setupNanoAdapter>>;
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  beforeAll(async () => {
    setup = await setupNanoAdapter("order_by");
    resources = setup.resources;
    adapter = setup.adapter;

    console.log(
      "model indexes",
      JSON.stringify(Model.indexes(LeaderboardEntry), null, 2)
    );

    // Ensure the composite index exists before querying
    const dbClient = (adapter as any).client;
    const createIndexSpy = jest.spyOn(dbClient, "createIndex");
    await (
      adapter as unknown as {
        index: (...models: (typeof LeaderboardEntry)[]) => Promise<void>;
      }
    ).index(LeaderboardEntry);

    console.log(
      "created indexes",
      createIndexSpy.mock.calls.map(([definition]) => definition)
    );

    console.log(
      "db index dump",
      JSON.stringify((await dbClient.get("_index")).indexes, null, 2)
    );

    console.log(
      "index fields detail",
      createIndexSpy.mock.calls.map(([definition]) =>
        JSON.stringify(definition?.index?.fields)
      )
    );

    console.log(
      "db index dump",
      JSON.stringify((await dbClient.get("_index")).indexes, null, 2)
    );

    repo = nanoRepository(LeaderboardEntry);

    const entries = [
      { id: 1, category: "alpha", score: 10 },
      { id: 2, category: "alpha", score: 7 },
      { id: 3, category: "beta", score: 12 },
      { id: 4, category: "beta", score: 9 },
      { id: 5, category: "beta", score: 5 },
      { id: 6, category: "gamma", score: 14 },
      { id: 7, category: "gamma", score: 11 },
      { id: 8, category: "gamma", score: 8 },
    ].map((entry) => new LeaderboardEntry(entry));

    await repo.createAll(entries);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("orders by category asc and score asc using enum directions", async () => {
    const condition = Condition.attribute<LeaderboardEntry>("category")
      .gte("")
      .and(Condition.attribute<LeaderboardEntry>("score").gte(0));

    const results = await repo
      .select()
      .where(condition)
      .orderBy("category", OrderDirection.ASC)
      .thenBy("score", OrderDirection.ASC)
      .execute();

    const categories = results.map((entry) => entry.category);
    expect(categories).toEqual([
      "alpha",
      "alpha",
      "beta",
      "beta",
      "beta",
      "gamma",
      "gamma",
      "gamma",
    ]);

    const alphaScores = results
      .filter((entry) => entry.category === "alpha")
      .map((entry) => entry.score);
    expect(alphaScores).toEqual([7, 10]);

    const betaScores = results
      .filter((entry) => entry.category === "beta")
      .map((entry) => entry.score);
    expect(betaScores).toEqual([5, 9, 12]);
  });

  it("supports string-based direction for chained sorts", async () => {
    const condition = Condition.attribute<LeaderboardEntry>("category")
      .gte("")
      .and(Condition.attribute<LeaderboardEntry>("score").gte(0));

    const results = await repo
      .select()
      .where(condition)
      .orderBy("category", OrderDirection.ASC)
      .thenBy("score", "asc")
      .execute();

    const gammaScores = results
      .filter((entry) => entry.category === "gamma")
      .map((entry) => entry.score);
    expect(gammaScores).toEqual([8, 11, 14]);
  });
});
