import { PersistenceService } from "@decaf-ts/core";
import {
  TaskBackoffModel,
  TaskEventBus,
  TaskHandlerRegistry,
  TaskModel,
  TaskService,
} from "@decaf-ts/core/tasks";
import { NotFoundError, ConflictError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const dbHost = process.env.NANO_HOST || "localhost:10010";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

const buildTask = (classification: string) =>
  new TaskModel({
    classification,
    maxAttempts: 3,
    backoff: new TaskBackoffModel(),
  });

describe("TaskService multi-db routing", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let persistence: PersistenceService<NanoAdapter>;
  let mainAdapter: NanoAdapter;
  let taskService: TaskService<NanoAdapter>;
  let adminConnection: ReturnType<typeof NanoAdapter.connect>;
  const tasksDbName = "tasks";
  const tasksUser = `tasks_user_${Date.now()}`;
  const tasksPassword = `${tasksUser}_pw`;

  beforeAll(async () => {
    resources = await createNanoTestResources("task-service-multi-db");
    adminConnection = NanoAdapter.connect(
      adminUser,
      adminPassword,
      resources.host,
      resources.protocol
    );
    await NanoAdapter.createDatabase(adminConnection, tasksDbName).catch(
      (error) => {
        if (!(error instanceof ConflictError)) throw error;
      }
    );
    await NanoAdapter.createUser(
      adminConnection,
      tasksDbName,
      tasksUser,
      tasksPassword
    ).catch((error) => {
      if (!(error instanceof ConflictError)) throw error;
    });

    persistence = new PersistenceService<NanoAdapter>();
    const { client } = await persistence.initialize([
      [
        NanoAdapter,
        {
          user: resources.user,
          password: resources.password,
          host: resources.host,
          dbName: resources.dbName,
          protocol: resources.protocol,
        },
        resources.dbName,
      ],
    ]);
    [mainAdapter] = client;

    taskService = new TaskService<NanoAdapter>();
    await taskService.boot({
      adapter: mainAdapter,
      bus: new TaskEventBus(),
      registry: new TaskHandlerRegistry(),
      workerId: "nano-task-service",
      concurrency: 1,
      leaseMs: 500,
      pollMsIdle: 1000,
      pollMsBusy: 200,
      logTailMax: 200,
      streamBufferSize: 5,
      maxLoggingBuffer: 100,
      loggingBufferTruncation: 10,
      gracefulShutdownMsTimeout: 4000,
      overrides: {
        user: tasksUser,
        password: tasksPassword,
        dbName: tasksDbName,
      } as any,
    });
    const primaryTask = new TaskModel({
      classification: "primary-task",
      maxAttempts: 3,
      backoff: new TaskBackoffModel(),
      createdBy: "system",
      updatedBy: "system",
    });
    const primaryDoc = JSON.parse(primaryTask.serialize());
    delete primaryDoc.__model;
    await adminConnection.db.use(resources.dbName).insert(primaryDoc);
  });

  afterAll(async () => {
    await taskService.shutdown();
    await persistence.shutdown();
    await cleanupNanoTestResources(resources);
    try {
      await NanoAdapter.deleteDatabase(adminConnection, tasksDbName);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    try {
      await NanoAdapter.deleteUser(adminConnection, tasksDbName, tasksUser);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    NanoAdapter.closeConnection(adminConnection);
  });

  it("persists tasks using overrides to a dedicated tasks database", async () => {
    const created = await taskService.create(buildTask("service-task"));

    const mainDb = adminConnection.db.use(resources.dbName);
    const mainDocs = await mainDb.list({ include_docs: true });
    expect(
      mainDocs.rows.some(
        (row) => row.doc && row.doc.classification === "primary-task"
      )
    ).toBe(true);

    const tasksDb = adminConnection.db.use(tasksDbName);
    const tasksDocs = await tasksDb.list({ include_docs: true });
    const persisted = tasksDocs.rows.find(
      (row) => row.doc && row.doc.classification === created.classification
    );
    expect(persisted).toBeDefined();
  });
});
