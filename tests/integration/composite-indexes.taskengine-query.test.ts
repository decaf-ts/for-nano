import { NanoAdapter, NanoRepository } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

import {
  BaseModel,
  Condition,
  index,
  OrderDirection,
  pk,
} from "@decaf-ts/core";
import { TaskStatus } from "@decaf-ts/core/tasks";
import { uses } from "@decaf-ts/decoration";
import {
  date,
  model,
  Model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";

Model.setBuilder(Model.fromModel);

jest.setTimeout(120000);

type NanoResources = Awaited<ReturnType<typeof createNanoTestResources>>;

@uses("nano")
@model()
class IndexedRunnableTask extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  @type(String)
  @index([OrderDirection.ASC, OrderDirection.DSC], ["nextRunAt"])
  status!: TaskStatus;

  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC], ["bucket"])
  priority!: number;

  @required()
  bucket!: string;

  @date()
  nextRunAt?: Date;

  @date()
  leaseExpiry?: Date;

  @date()
  scheduledTo?: Date;

  constructor(arg?: ModelArg<IndexedRunnableTask>) {
    super(arg);
  }
}

describe("@index composite properties on nano", () => {
  let resources: NanoResources;
  let adapter: NanoAdapter;
  let repo: NanoRepository<IndexedRunnableTask>;

  beforeAll(async () => {
    resources = await createNanoTestResources("composite_taskengine_query");
    adapter = new NanoAdapter(
      {
        user: resources.user,
        password: resources.password,
        host: resources.host,
        dbName: resources.dbName,
        protocol: resources.protocol,
      },
      resources.dbName
    );
    await adapter.initialize();
    repo = new NanoRepository(adapter, IndexedRunnableTask);
  });

  afterAll(async () => {
    if (adapter) await adapter.shutdown();
    if (resources) await cleanupNanoTestResources(resources);
  });

  it("generates composite indexes with one and multiple composed properties", async () => {
    const dbClient = (adapter as any).client;
    const indexDump = await dbClient.get("_index");
    const indexes = (indexDump?.indexes || []) as Array<{
      name?: string;
      def?: { fields?: Array<string | Record<string, string>> };
    }>;
    const hasStatusNextRunAtAsc = indexes.some((idx) => {
      const fields = idx.def?.fields;
      if (!Array.isArray(fields) || fields.length < 3) return false;

      return (
        typeof fields[1] === "object" &&
        (fields[1] as Record<string, string>).status === OrderDirection.ASC &&
        typeof fields[2] === "object" &&
        (fields[2] as Record<string, string>).nextRunAt === OrderDirection.ASC
      );
    });

    const hasPriorityBucketAsc = indexes.some((idx) => {
      const fields = idx.def?.fields;
      if (!Array.isArray(fields) || fields.length < 3) return false;
      return (
        typeof fields[1] === "object" &&
        (fields[1] as Record<string, string>).priority === OrderDirection.ASC &&
        typeof fields[2] === "object" &&
        (fields[2] as Record<string, string>).bucket === OrderDirection.ASC
      );
    });

    expect(hasStatusNextRunAtAsc).toBe(true);
    expect(hasPriorityBucketAsc).toBe(true);
  });

  it("queries and sorts by 3 properties without missing-index warnings", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);

    const data = [
      new IndexedRunnableTask({
        id: 1,
        status: TaskStatus.PENDING,
        priority: 2,
        bucket: "a",
        nextRunAt: past,
        leaseExpiry: past,
        scheduledTo: past,
      }),
      new IndexedRunnableTask({
        id: 2,
        status: TaskStatus.WAITING_RETRY,
        priority: 1,
        bucket: "a",
        nextRunAt: past,
        leaseExpiry: future,
        scheduledTo: future,
      }),
      new IndexedRunnableTask({
        id: 3,
        status: TaskStatus.WAITING_RETRY,
        priority: 1,
        bucket: "b",
        nextRunAt: future,
        leaseExpiry: future,
        scheduledTo: future,
      }),
      new IndexedRunnableTask({
        id: 4,
        status: TaskStatus.RUNNING,
        priority: 3,
        bucket: "b",
        nextRunAt: future,
        leaseExpiry: past,
        scheduledTo: future,
      }),
      new IndexedRunnableTask({
        id: 5,
        status: TaskStatus.RUNNING,
        priority: 3,
        bucket: "b",
        nextRunAt: future,
        leaseExpiry: future,
        scheduledTo: future,
      }),
      new IndexedRunnableTask({
        id: 6,
        status: TaskStatus.SCHEDULED,
        priority: 0,
        bucket: "c",
        nextRunAt: future,
        leaseExpiry: future,
        scheduledTo: past,
      }),
      new IndexedRunnableTask({
        id: 7,
        status: TaskStatus.SCHEDULED,
        priority: 4,
        bucket: "c",
        nextRunAt: future,
        leaseExpiry: future,
        scheduledTo: future,
      }),
    ];
    await repo.createAll(data);

    const client = (adapter as any).client;
    const originalFind = client.find.bind(client);
    const findWarnings: string[] = [];

    const findSpy = jest
      .spyOn(client, "find")
      .mockImplementation(async (query: any) => {
        const response = await originalFind(query);
        if (response?.warning) findWarnings.push(String(response.warning));
        return response;
      });

    try {
      const selected = await adapter.raw<IndexedRunnableTask[]>(
        {
          selector: {
            "??table": { $eq: Model.tableName(IndexedRunnableTask) },
            status: { $gte: "" },
            priority: { $gt: null },
            bucket: { $gt: null },
          },
          sort: [
            { "??table": "asc" },
            { priority: "asc" },
            { bucket: "asc" },
          ],
          limit: 1000,
        },
        true
      );

      expect(selected).toHaveLength(7);
      expect(findWarnings).toEqual([]);

      const explainQuery = {
        selector: {
          "??table": { $eq: Model.tableName(IndexedRunnableTask) },
          status: { $gte: "" },
          priority: { $gt: null },
          bucket: { $gt: null },
        },
        sort: [{ "??table": "asc" }, { priority: "asc" }, { bucket: "asc" }],
        limit: 1000,
      };

      const native = client["__native"] as {
        request: (arg: Record<string, any>) => Promise<any>;
      };
      const explain = await native.request({
        db: resources.dbName,
        path: "_explain",
        method: "POST",
        body: explainQuery,
      });

      const usedFields = explain?.index?.def?.fields as
        | Array<string | Record<string, string>>
        | undefined;

      expect(Array.isArray(usedFields)).toBe(true);
      expect(
        usedFields?.some(
          (field) =>
            typeof field === "object" &&
            (field as Record<string, string>)["??table"] === "asc"
        )
      ).toBe(true);
      expect(
        usedFields?.some(
          (field) =>
            typeof field === "object" &&
            (field as Record<string, string>).priority === "asc"
        )
      ).toBe(true);
      expect(
        usedFields?.some(
          (field) =>
            typeof field === "object" &&
            (field as Record<string, string>).bucket === "asc"
        )
      ).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("recreates core taskengine runnable query and returns only runnable tasks", async () => {
    const now = new Date();
    const condPending = Condition.attribute<IndexedRunnableTask>("status").eq(
      TaskStatus.PENDING
    );
    const condRetry = Condition.attribute<IndexedRunnableTask>("status")
      .eq(TaskStatus.WAITING_RETRY)
      .and(Condition.attribute<IndexedRunnableTask>("nextRunAt").lte(now));
    const condLeaseExpired = Condition.attribute<IndexedRunnableTask>("status")
      .eq(TaskStatus.RUNNING)
      .and(Condition.attribute<IndexedRunnableTask>("leaseExpiry").lte(now));
    const condScheduled = Condition.attribute<IndexedRunnableTask>("status")
      .eq(TaskStatus.SCHEDULED)
      .and(Condition.attribute<IndexedRunnableTask>("scheduledTo").lte(now));
    const runnable = condPending
      .or(condRetry)
      .or(condLeaseExpired)
      .or(condScheduled);

    const selected = await repo.select().where(runnable).execute();
    expect(selected.map((task) => task.id).sort((a, b) => a - b)).toEqual([
      1, 2, 4, 6,
    ]);
  });
});
