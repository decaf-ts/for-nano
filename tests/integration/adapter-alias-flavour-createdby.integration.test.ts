import { uses } from "@decaf-ts/decoration";
import { createdBy, pk, Repository } from "@decaf-ts/core";
import { Model, model, required, type ModelArg } from "@decaf-ts/decorator-validation";
import { NanoAdapter } from "../../src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../helpers/nano";

@uses("nano")
@model()
class StandardNanoModel extends Model {
  @pk({ type: String })
  id!: string;

  @required()
  name!: string;

  @createdBy()
  createdBy!: string;

  constructor(arg?: ModelArg<StandardNanoModel>) {
    super(arg);
  }
}

@uses("tasks")
@model()
class TasksAliasModel extends Model {
  @pk({ type: String })
  id!: string;

  @required()
  name!: string;

  @createdBy()
  createdBy!: string;

  constructor(arg?: ModelArg<TasksAliasModel>) {
    super(arg);
  }
}

describe("for-nano adapter alias vs flavour createdBy resolution", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let standardAdapter: NanoAdapter;
  let tasksAdapter: NanoAdapter;

  beforeAll(async () => {
    resources = await createNanoTestResources("alias_flavour_createdby");
    const conf = {
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    };

    standardAdapter = new NanoAdapter(conf);
    tasksAdapter = new NanoAdapter(conf, "tasks");

    await standardAdapter.initialize();
    await tasksAdapter.initialize();
  });

  afterAll(async () => {
    if (tasksAdapter) await tasksAdapter.shutdown().catch(() => undefined);
    if (standardAdapter) await standardAdapter.shutdown().catch(() => undefined);
    if (resources) await cleanupNanoTestResources(resources);
  });

  it("uses flavour handlers for both default and aliased nano adapters", async () => {
    const standardRepo = Repository.forModel(StandardNanoModel);
    const tasksRepo = Repository.forModel(TasksAliasModel);

    expect((standardRepo as any).adapter.alias).toBe("nano");
    expect((standardRepo as any).adapter).toBe(standardAdapter);
    expect((tasksRepo as any).adapter.alias).toBe("tasks");
    expect((tasksRepo as any).adapter).toBe(tasksAdapter);

    const standardCreated = await standardRepo.create(
      new StandardNanoModel({
        id: `std-${Date.now()}`,
        name: "standard",
      })
    );

    const tasksCreated = await tasksRepo.create(
      new TasksAliasModel({
        id: `tsk-${Date.now()}`,
        name: "tasks",
      })
    );

    expect(standardCreated.createdBy).toEqual(resources.user);
    expect(tasksCreated.createdBy).toEqual(resources.user);
  });
});
