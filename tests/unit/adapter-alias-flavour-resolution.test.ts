import { createdBy, Adapter } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";
import { OperationKeys, Operations } from "@decaf-ts/db-decorators";
import { NanoAdapter, NanoFlavour, createdByOnNanoCreateUpdate } from "../../src";

describe("adapter alias vs flavour resolution", () => {
  beforeEach(() => {
    Adapter.unregister("tasks");
    Adapter.unregister(NanoFlavour);
  });

  afterEach(() => {
    Adapter.unregister("tasks");
    Adapter.unregister(NanoFlavour);
  });

  it("resolves @uses(alias) models to adapter flavour handlers", () => {
    const conf = {
      user: "nano-user",
      password: "nano-pass",
      host: "127.0.0.1:5984",
      dbName: "nano-db",
      protocol: "http" as const,
    };

    const standard = new NanoAdapter(conf, NanoFlavour);
    const tasks = new NanoAdapter(conf, "tasks");
    void standard;
    void tasks;

    @uses(NanoFlavour)
    @model()
    class StandardNanoModel extends Model {
      @createdBy()
      createdBy!: string;

      constructor(arg?: ModelArg<StandardNanoModel>) {
        super(arg);
      }
    }

    @uses("tasks")
    @model()
    class TasksAliasModel extends Model {
      @createdBy()
      createdBy!: string;

      constructor(arg?: ModelArg<TasksAliasModel>) {
        super(arg);
      }
    }

    const onCreateKey = OperationKeys.ON + OperationKeys.CREATE;

    const standardHandlers = Operations.get(
      StandardNanoModel,
      "createdBy",
      onCreateKey
    );
    const tasksHandlers = Operations.get(TasksAliasModel, "createdBy", onCreateKey);

    expect(standardHandlers).toBeDefined();
    expect(tasksHandlers).toBeDefined();
    expect(standardHandlers?.[0]).toBe(createdByOnNanoCreateUpdate);
    expect(tasksHandlers?.[0]).toBe(createdByOnNanoCreateUpdate);
  });
});
