import { OrderDirection, Repository } from "@decaf-ts/core";
import { defaultQueryAttr } from "@decaf-ts/core";
import {
  TaskBackoffModel,
  TaskEventModel,
  TaskEventType,
  TaskModel,
  TaskStatus,
} from "@decaf-ts/core/tasks";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

jest.setTimeout(50000);

defaultQueryAttr()(TaskModel.prototype, "classification");
defaultQueryAttr()(TaskModel.prototype, "name");
defaultQueryAttr()(TaskEventModel.prototype, "taskId");
defaultQueryAttr()(TaskEventModel.prototype, "classification");

type NanoResources = Awaited<ReturnType<typeof createNanoTestResources>>;

const buildTask = (overrides: Partial<TaskModel> = {}) => {
  const classification =
    overrides.classification ??
    `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const name =
    overrides.name ?? `task-name-${Math.random().toString(36).slice(2, 6)}`;
  const backoff = overrides.backoff ?? new TaskBackoffModel();

  return new TaskModel({
    classification,
    name,
    maxAttempts: overrides.maxAttempts ?? 3,
    backoff,
    input: overrides.input,
    ...overrides,
  });
};

describe("TaskModel and TaskEventModel repositories", () => {
  let resources: NanoResources;
  let adapter: NanoAdapter;
  let taskRepo: Repository<TaskModel, any>;
  let eventRepo: Repository<TaskEventModel, any>;

  beforeAll(async () => {
    resources = await createNanoTestResources("task-models");
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
    taskRepo = Repository.forModel(TaskModel, adapter.alias);
    eventRepo = Repository.forModel(TaskEventModel, adapter.alias);
    await adapter.initialize();
  });

  afterEach(async () => {
    const existingTasks = await taskRepo.select().execute();
    if (existingTasks.length) {
      await taskRepo.deleteAll(existingTasks.map((t) => t.id));
    }
    const existingEvents = await eventRepo.select().execute();
    if (existingEvents.length) {
      await eventRepo.deleteAll(existingEvents.map((evt) => evt.id));
    }
  });

  afterAll(async () => {
    await adapter.shutdown();
    await cleanupNanoTestResources(resources);
  });

  it("performs task CRUD operations", async () => {
    const toCreate = buildTask({ classification: "crud-task" });
    const created = await taskRepo.create(toCreate);
    expect(created.id).toBeDefined();
    expect(created.status).toBe(TaskStatus.PENDING);

    const read = await taskRepo.read(created.id);
    expect(read.classification).toBe(created.classification);

    read.status = TaskStatus.SUCCEEDED;
    read.output = { value: 42 };
    read.name = "crud-task-updated";
    const updated = await taskRepo.update(read);
    expect(updated.status).toBe(TaskStatus.SUCCEEDED);
    expect(updated.output).toEqual({ value: 42 });

    await taskRepo.delete(updated.id);
    await expect(taskRepo.read(updated.id)).rejects.toThrow(NotFoundError);
  });

  it("supports bulk task operations", async () => {
    const models = Array.from({ length: 3 }, (_, index) =>
      buildTask({ classification: `bulk-task-${index + 1}` })
    );
    const created = await taskRepo.createAll(models);
    expect(created).toHaveLength(3);

    const read = await taskRepo.readAll(created.map((t) => t.id));
    expect(read).toHaveLength(3);

    const toUpdate = read.map((task, index) => {
      task.name = `updated-${index}`;
      task.status = TaskStatus.SUCCEEDED;
      return task;
    });
    const updated = await taskRepo.updateAll(toUpdate);
    expect(updated.every((t) => t.status === TaskStatus.SUCCEEDED)).toBe(true);

    const deleted = await taskRepo.deleteAll(updated.map((t) => t.id));
    expect(deleted).toHaveLength(3);
    await expect(taskRepo.read(created[0].id)).rejects.toThrow(NotFoundError);
  });

  it("exposes list/find/pagination helpers", async () => {
    const classifications = ["find-a", "find-b", "find-c"];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const created = await taskRepo.createAll(
      classifications.map((classification) => buildTask({ classification }))
    );

    const listed = await taskRepo.listBy("createdAt", OrderDirection.ASC);
    expect(listed.some((t) => classifications.includes(t.classification))).toBe(
      true
    );

    const paged = await taskRepo.paginateBy("createdAt", OrderDirection.ASC, {
      offset: 1,
      limit: 2,
    });
    expect(paged.data).toHaveLength(2);

    const found = await taskRepo.find("find", OrderDirection.ASC);
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.every((t) => t.classification?.startsWith("find"))).toBe(true);

    const pageResult = await taskRepo.page("find", OrderDirection.ASC, {
      offset: 1,
      limit: 2,
    });
    expect(pageResult.data.length).toBeLessThanOrEqual(2);

    const byClassification = await taskRepo.findBy("classification", "find-a");
    expect(byClassification[0].classification).toBe("find-a");

    const foundOne = await taskRepo.findOneBy("classification", "find-b");
    expect(foundOne.classification).toBe("find-b");
  });

  it("manages task events and query helpers", async () => {
    const task = await taskRepo.create(
      buildTask({ classification: "event-task" })
    );
    const eventsToCreate = [
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.RUNNING },
      }),
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.SCHEDULED },
      }),
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.PROGRESS,
        payload: { detail: "halfway" },
      }),
    ];

    const createdEvents = await eventRepo.createAll(eventsToCreate);
    expect(createdEvents).toHaveLength(3);
    const primaryEvent = await eventRepo.read(createdEvents[0].id);
    expect((primaryEvent.payload as any)?.status).toBe(TaskStatus.RUNNING);

    const listByTs = await eventRepo.listBy("ts", OrderDirection.DSC);
    expect(listByTs.length).toBeGreaterThanOrEqual(3);

    const paged = await eventRepo.paginateBy("ts", OrderDirection.DSC, {
      offset: 1,
      limit: 2,
    });
    expect(paged.data.length).toBeGreaterThan(0);

    const found = await eventRepo.find(task.id, OrderDirection.DSC);
    expect(found.some((evt) => evt.id === primaryEvent.id)).toBe(true);

    const byStatus = await eventRepo.findBy(
      "classification",
      TaskEventType.STATUS
    );
    expect(
      byStatus.every((evt) => evt.classification === TaskEventType.STATUS)
    ).toBe(true);

    const progressEvent = await eventRepo.findOneBy(
      "classification",
      TaskEventType.PROGRESS
    );
    expect(progressEvent?.classification).toBe(TaskEventType.PROGRESS);

    await eventRepo.delete(primaryEvent.id);
    await expect(eventRepo.read(primaryEvent.id)).rejects.toThrow(
      NotFoundError
    );
  });
});
