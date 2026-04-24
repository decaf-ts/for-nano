import "@decaf-ts/core";
import { LogLevel, Logging } from "@decaf-ts/logging";
import { Repository, Repo } from "@decaf-ts/core";
import { Observer } from "@decaf-ts/core/interfaces";
import {
  CompositeTaskBuilder,
  TaskBuilder,
  TaskContext,
  TaskEventBus,
  TaskEventModel,
  TaskEventType,
  TaskHandler,
  TaskHandlerRegistry,
  TaskLogger,
  TaskModel,
  TaskService,
  TaskStatus,
  TaskEngine,
  task,
} from "@decaf-ts/core/tasks";
import { TaskEngineConfig } from "@decaf-ts/core/tasks/types";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";
import { setupNanoAdapter } from "../helpers/nanoSetup";
import { NanoAdapter } from "../../src";

jest.setTimeout(200000);

type NanoResources = Awaited<ReturnType<typeof createNanoTestResources>>;

const recordedEvents: TaskEventModel[] = [];

const parseNumberInput = (input: unknown): number => {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const asNumber = Number(input);
    if (!Number.isNaN(asNumber)) return asNumber;
  }
  if (typeof input === "object" && input !== null) {
    const value = (input as { value?: unknown }).value;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const asNumber = Number(value);
      if (!Number.isNaN(asNumber)) return asNumber;
    }
  }
  throw new Error("invalid task input");
};

@task("nano-simple-task")
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NanoSimpleTask extends TaskHandler<number | { value: number }, number> {
  async run(value: number | { value: number }, ctx: TaskContext) {
    const parsed = parseNumberInput(value);
    ctx.logger.info(`nano-simple-task ${parsed}`);
    await ctx.flush();
    return parsed * 3;
  }
}

@task("nano-progress-task")
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NanoProgressTask extends TaskHandler<{ value: number }, number> {
  async run(input: { value: number }, ctx: TaskContext) {
    const parsed = parseNumberInput(input);
    ctx.logger.info("nano-progress-task: before step 1");
    await ctx.flush();
    await ctx.progress({
      status: TaskStatus.RUNNING,
      currentStep: 1,
      totalSteps: 2,
    });
    ctx.logger.info("nano-progress-task: before step 2");
    await ctx.flush();
    await ctx.progress({
      status: TaskStatus.RUNNING,
      currentStep: 2,
      totalSteps: 2,
    });
    ctx.logger.info("nano-progress-task: finished");
    await ctx.flush();
    return parsed + 7;
  }
}

@task("nano-dynamic-enqueue")
class NanoDynamicEnqueueTask extends TaskHandler<{ seed?: number } | void, number> {
  static runs: Record<string, number> = {};

  async run(input: { seed?: number } | void, ctx: TaskContext) {
    NanoDynamicEnqueueTask.runs[ctx.taskId] =
      (NanoDynamicEnqueueTask.runs[ctx.taskId] ?? 0) + 1;
    const parsed = parseNumberInput((input as any)?.seed ?? 5);
    await ctx
      .scheduleSteps(
        {
          classification: "nano-dynamic-flaky",
        },
        {
          classification: "nano-dynamic-tail",
        }
      )
      .afterCurrent();
    return parsed;
  }
}

@task("nano-dynamic-flaky")
class NanoDynamicFlakyTask extends TaskHandler<void, number> {
  static runs: Record<string, number> = {};

  async run(_: void, ctx: TaskContext) {
    const run = (NanoDynamicFlakyTask.runs[ctx.taskId] ?? 0) + 1;
    NanoDynamicFlakyTask.runs[ctx.taskId] = run;
    const cache = ctx.resultCache ?? {};
    const seed = cache[`${ctx.taskId}:step:0`];
    if (typeof seed !== "number") throw new Error("missing seed cache");
    if (run === 1) throw new Error("intentional dynamic flaky failure");
    return seed + 1;
  }
}

@task("nano-dynamic-tail")
class NanoDynamicTailTask extends TaskHandler<void, number> {
  static runs: Record<string, number> = {};

  async run(_: void, ctx: TaskContext) {
    NanoDynamicTailTask.runs[ctx.taskId] =
      (NanoDynamicTailTask.runs[ctx.taskId] ?? 0) + 1;
    const cache = ctx.resultCache ?? {};
    const prev = cache[`${ctx.taskId}:step:1`];
    if (typeof prev !== "number") throw new Error("missing flaky cache");
    return prev + 1;
  }
}

describe("Nano task engine integration", () => {
  let adapter: NanoAdapter;
  let resources: NanoResources | undefined;
  let taskService: TaskService;
  let engine: TaskEngine<NanoAdapter>;
  let taskRepo: Repo<TaskModel>;
  let eventBus: TaskEventBus;
  let registry: TaskHandlerRegistry;
  let unsubscribe: (() => void) | undefined;

  beforeAll(async () => {
    const setup = await setupNanoAdapter("task-engine");
    resources = setup.resources;
    adapter = setup.adapter;

    eventBus = new TaskEventBus();
    registry = new TaskHandlerRegistry();

    const config: TaskEngineConfig<NanoAdapter> = {
      adapter,
      bus: eventBus,
      registry,
      workerId: "nano-integration-worker",
      concurrency: 1,
      leaseMs: 500,
      pollMsIdle: 1000,
      pollMsBusy: 200,
      logTailMax: 200,
      streamBufferSize: 5,
      maxLoggingBuffer: 100,
      loggingBufferTruncation: 10,
      gracefulShutdownMsTimeout: 4000,
    };

    taskService = new TaskService();
    await taskService.boot(config);
    engine = taskService.client as TaskEngine<NanoAdapter>;
    await engine.start();

    taskRepo = Repository.forModel(TaskModel, adapter.alias);

    const observer: Observer = {
      async refresh(evt: TaskEventModel) {
        if (evt?.taskId) {
          recordedEvents.push(evt);
        }
      },
    };
    unsubscribe = eventBus.observe(observer);
  });

  beforeEach(() => {
    recordedEvents.length = 0;
  });

  afterAll(async () => {
    unsubscribe?.();
    await taskService.shutdown();
    await adapter.shutdown();
    if (resources) {
      await cleanupNanoTestResources(resources);
    }
  });

  const eventsFor = (taskId: string, type?: TaskEventType) =>
    recordedEvents.filter(
      (evt) =>
        evt && evt.taskId === taskId && (!type || evt.classification === type)
    );

  const waitForTaskStatus = async (
    id: string,
    status: TaskStatus,
    timeout = 30000
  ) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const task = await taskRepo.read(id);
      if (task.status === status) return task;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Task ${id} did not reach ${status} within ${timeout}ms`);
  };

  it("executes a task and logs status events", async () => {
    const toSubmit = new TaskBuilder()
      .setClassification("nano-simple-task")
      .setInput({ value: 6 })
      .build();

    const { task, tracker } = await engine.push(toSubmit, true);
    const output = await tracker.resolve();

    expect(output).toBe(18);

    const persisted = await taskRepo.read(task.id);
    expect(persisted.status).toBe(TaskStatus.SUCCEEDED);
    expect(persisted.output).toBe(18);

    const statusEvents = eventsFor(task.id, TaskEventType.STATUS);
    const statusValues = statusEvents.map((evt) => evt.payload?.status);
    expect(statusValues).toEqual(
      expect.arrayContaining([TaskStatus.RUNNING, TaskStatus.SUCCEEDED])
    );
  });

  it("pipes status and progress events through the tracker", async () => {
    const capturedStatuses: TaskStatus[] = [];
    const progressPayloads: TaskEventModel[] = [];

    const composite = new TaskBuilder()
      .setClassification("nano-progress-task")
      .setInput({ value: 3 })
      .build();

    const { tracker } = await engine.push(composite, true);

    tracker.pipe((evt) => {
      const status = evt.payload?.status ?? evt.payload;
      if (typeof status === "string") {
        capturedStatuses.push(status as TaskStatus);
      }
    }, TaskEventType.STATUS);

    tracker.pipe((evt) => {
      progressPayloads.push(evt);
    }, TaskEventType.PROGRESS);

    const output = await tracker.resolve();
    expect(output).toBe(10);

    expect(capturedStatuses).toContain(TaskStatus.SUCCEEDED);
    expect(progressPayloads.length).toBeGreaterThanOrEqual(2);
    expect(progressPayloads[0].payload).toMatchObject({
      currentStep: 1,
      totalSteps: 2,
    });
  });

  it("records task events via the TaskEventModel repository", async () => {
    const eventRepo = Repository.forModel(TaskEventModel, adapter.alias);
    const composite = new TaskBuilder()
      .setClassification("nano-progress-task")
      .setInput({ value: 2 })
      .build();

    const { task, tracker } = await engine.push(composite, true);
    await tracker.resolve();

    const allEvents = await eventRepo.select().execute();
    const taskEvents = allEvents.filter((evt) => evt.taskId === task.id);

    expect(taskEvents.length).toBeGreaterThan(0);
    expect(
      taskEvents.some((evt) => evt.classification === TaskEventType.STATUS)
    ).toBe(true);
    expect(
      taskEvents.some((evt) => evt.classification === TaskEventType.LOG)
    ).toBe(true);

    const statusPayloads = taskEvents
      .filter((evt) => evt.classification === TaskEventType.STATUS)
      .map((evt) => {
        const payload = evt.payload;
        if (!payload) return undefined;
        if (typeof payload === "string") {
          try {
            return JSON.parse(payload);
          } catch {
            return undefined;
          }
        }
        return payload;
      })
      .map((payload) => (payload as any)?.status);
    expect(statusPayloads).toContain(TaskStatus.SUCCEEDED);
  });

  it("attaches a custom logger and flushes raw logs", async () => {
    const baseLogger = Logging.get().for("nano-task-engine");
    const infoSpy = jest.spyOn(baseLogger, "info");
    const logger = new TaskLogger(baseLogger, 5, 10);
    const rawMessages: string[] = [];

    const toSubmit = new TaskBuilder()
      .setClassification("nano-progress-task")
      .setInput({ value: 1 })
      .build();

    const { tracker } = await engine.push(toSubmit, true);
    tracker.pipe((evt) => {
      if (evt.classification !== TaskEventType.LOG) return;
      const logs = evt.payload as Array<{
        level: LogLevel;
        msg: string;
        meta: unknown;
      }>;

      evt.payload = logs.map(({ level, msg, meta }) => [level, msg, meta]);
    });
    tracker.attach(logger, {
      logProgress: true,
      logStatus: true,
      style: false,
    });

    tracker.logs((logs) => {
      rawMessages.push(
        ...logs.map(
          (entry: [unknown, string | undefined, unknown]) => `${entry[1] ?? ""}`
        )
      );
    });

    try {
      await tracker.resolve();

      expect(
        rawMessages.some((msg) => msg.includes("nano-progress-task"))
      ).toBe(true);
      const infoCalls = infoSpy.mock.calls.map((call) => `${call[0] ?? ""}`);
      expect(infoCalls.some((call) => call.includes("### STATUS"))).toBe(true);
      expect(infoCalls.some((call) => call.includes("### STEP"))).toBe(true);
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("persists dynamically added steps across retry and emits tracker update events", async () => {
    NanoDynamicEnqueueTask.runs = {};
    NanoDynamicFlakyTask.runs = {};
    NanoDynamicTailTask.runs = {};

    const updateEvents: TaskEventModel[] = [];
    const task = new CompositeTaskBuilder()
      .setClassification("nano-dynamic-chain")
      .setMaxAttempts(2)
      .addStep("nano-dynamic-enqueue", { seed: 7 })
      .build();

    const { task: pushed, tracker } = await engine.push(task, true);
    tracker.onUpdate(async (evt) => {
      updateEvents.push(evt);
    });

    const waitingRetry = await waitForTaskStatus(
      pushed.id,
      TaskStatus.WAITING_RETRY
    );
    expect(waitingRetry.currentStep).toBe(1);
    expect(waitingRetry.steps?.map((step) => step.classification)).toEqual([
      "nano-dynamic-enqueue",
      "nano-dynamic-flaky",
      "nano-dynamic-tail",
    ]);

    const output = await tracker.resolve();
    expect(output.stepResults.length).toBe(3);
    expect(output.stepResults[0].output).toBe(7);
    expect(output.stepResults[1].output).toBe(8);
    expect(output.stepResults[2].output).toBe(9);

    expect(NanoDynamicEnqueueTask.runs[pushed.id]).toBe(1);
    expect(NanoDynamicFlakyTask.runs[pushed.id]).toBe(2);
    expect(NanoDynamicTailTask.runs[pushed.id]).toBe(1);
    expect(updateEvents.length).toBeGreaterThan(0);
    expect(updateEvents[0].classification).toBe(TaskEventType.UPDATE);
  });
});
