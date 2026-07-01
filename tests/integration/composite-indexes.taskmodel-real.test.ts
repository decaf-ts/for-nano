import { Condition, defaultQueryAttr, Repository } from "@decaf-ts/core";
import {
  TaskBackoffModel,
  TaskModel,
  TaskStatus,
} from "@decaf-ts/core/tasks";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

jest.setTimeout(120000);

defaultQueryAttr()(TaskModel.prototype, "classification");
defaultQueryAttr()(TaskModel.prototype, "name");

type NanoResources = Awaited<ReturnType<typeof createNanoTestResources>>;

const buildTask = (overrides: Partial<TaskModel> = {}) => {
  const classification =
    overrides.classification ??
    `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const backoff = overrides.backoff ?? new TaskBackoffModel();

  return new TaskModel({
    classification,
    maxAttempts: overrides.maxAttempts ?? 3,
    backoff,
    ...overrides,
  });
};

describe("TaskModel real @index coverage for TaskEngine.claimBatch", () => {
  let resources: NanoResources;
  let adapter: NanoAdapter;
  let taskRepo: Repository<TaskModel, any>;

  beforeAll(async () => {
    resources = await createNanoTestResources("taskmodel_real_indexes");
    adapter = new NanoAdapter(
      {
        couchUser: resources.user,
        couchPassword: resources.password,
        host: resources.host,
        dbName: resources.dbName,
        protocol: resources.protocol,
      },
      resources.dbName
    );
    taskRepo = Repository.forModel(TaskModel, adapter.alias);
    await adapter.initialize();
  });

  afterAll(async () => {
    await adapter.shutdown();
    await cleanupNanoTestResources(resources);
  });

  it("recreates TaskEngine.claimBatch's runnable query without missing-index warnings", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);

    const tasks = [
      // runnable: PENDING
      buildTask({ classification: "real-pending", status: TaskStatus.PENDING }),
      // runnable: WAITING_RETRY with nextRunAt in the past
      buildTask({
        classification: "real-retry-due",
        status: TaskStatus.WAITING_RETRY,
        nextRunAt: past,
      }),
      // not runnable: WAITING_RETRY with nextRunAt in the future
      buildTask({
        classification: "real-retry-future",
        status: TaskStatus.WAITING_RETRY,
        nextRunAt: future,
      }),
      // runnable: RUNNING with expired lease
      buildTask({
        classification: "real-running-expired-lease",
        status: TaskStatus.RUNNING,
        leaseExpiry: past,
      }),
      // not runnable: RUNNING with active lease
      buildTask({
        classification: "real-running-active-lease",
        status: TaskStatus.RUNNING,
        leaseExpiry: future,
      }),
      // runnable: SCHEDULED with scheduledTo in the past
      buildTask({
        classification: "real-scheduled-due",
        status: TaskStatus.SCHEDULED,
        scheduledTo: past,
      }),
      // not runnable: SCHEDULED with scheduledTo in the future
      buildTask({
        classification: "real-scheduled-future",
        status: TaskStatus.SCHEDULED,
        scheduledTo: future,
      }),
      // not runnable: SUCCEEDED
      buildTask({
        classification: "real-succeeded",
        status: TaskStatus.SUCCEEDED,
      }),
    ];

    const created = await taskRepo.createAll(tasks);

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
      const condPending = Condition.attribute<TaskModel>("status").eq(
        TaskStatus.PENDING
      );
      const condRetry = Condition.attribute<TaskModel>("status")
        .eq(TaskStatus.WAITING_RETRY)
        .and(Condition.attribute<TaskModel>("nextRunAt").lte(now));
      const condLeaseExpired = Condition.attribute<TaskModel>("status")
        .eq(TaskStatus.RUNNING)
        .and(Condition.attribute<TaskModel>("leaseExpiry").lte(now));
      const condScheduled = Condition.attribute<TaskModel>("status")
        .eq(TaskStatus.SCHEDULED)
        .and(Condition.attribute<TaskModel>("scheduledTo").lte(now));

      const runnable = condPending
        .or(condRetry)
        .or(condLeaseExpired)
        .or(condScheduled);

      const candidates = await taskRepo
        .select()
        .where(runnable)
        .limit(20)
        .execute();

      const candidateClassifications = candidates
        .map((t) => t.classification)
        .filter((c) => c?.startsWith("real-"));

      expect(candidateClassifications.sort()).toEqual(
        [
          "real-pending",
          "real-retry-due",
          "real-running-expired-lease",
          "real-scheduled-due",
        ].sort()
      );

      expect(findWarnings).toEqual([]);
    } finally {
      findSpy.mockRestore();
      await taskRepo.deleteAll(created.map((t) => t.id));
    }
  });
});
