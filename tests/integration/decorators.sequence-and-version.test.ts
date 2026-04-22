import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";
import { NanoAdapter, NanoRepository } from "../../src";

import { BaseModel, Repository, pk, sequence, version } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

Model.setBuilder(Model.fromModel);

jest.setTimeout(500000);

@uses("nano")
@model()
class PersistentVersionNanoModel extends BaseModel {
  @pk({ type: Number, generated: false })
  id!: number;

  @version(true)
  version!: number;

  constructor(arg?: ModelArg<PersistentVersionNanoModel>) {
    super(arg);
  }
}

@uses("nano")
@model()
class SequencePerInstanceNanoModel extends BaseModel {
  @pk({ type: Number, generated: false })
  id!: number;

  @sequence({ type: Number })
  step!: number;

  constructor(arg?: ModelArg<SequencePerInstanceNanoModel>) {
    super(arg);
  }
}

describe("core decorators on nano adapter", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let adapter: NanoAdapter;

  beforeAll(async () => {
    resources = await createNanoTestResources("decorators_seq_ver");
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
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("@persistentVersion() increments across update/delete/recreate for the same pk", async () => {
    const repo = Repository.forModel(
      PersistentVersionNanoModel,
      resources.dbName
    ) as NanoRepository<PersistentVersionNanoModel>;

    const created = await repo.create(
      new PersistentVersionNanoModel({ id: 1 })
    );
    expect(created.version).toBe(1);

    const updated = await repo.update(
      new PersistentVersionNanoModel({ ...created })
    );
    expect(updated.version).toBe(2);

    await repo.delete(updated.id);

    const recreated = await repo.create(
      new PersistentVersionNanoModel({ id: 1 })
    );
    expect(recreated.version).toBe(3);

    const another = await repo.create(
      new PersistentVersionNanoModel({ id: 2 })
    );
    expect(another.version).toBe(1);
  });

  it("@sequence() is per-model-instance (pk + property), not global per class", async () => {
    const repo = Repository.forModel(
      SequencePerInstanceNanoModel,
      resources.dbName
    ) as NanoRepository<SequencePerInstanceNanoModel>;

    let a = await repo.create(new SequencePerInstanceNanoModel({ id: 1 }));
    let b = await repo.create(new SequencePerInstanceNanoModel({ id: 2 }));

    expect(a.step).toBe(1);
    expect(b.step).toBe(1);

    a = await repo.delete(1);
    b = await repo.update(b);

    expect(a.step).toBe(1);
    expect(b.step).toBe(1);

    a = await repo.create(new SequencePerInstanceNanoModel({ id: 1 }));
    delete b.step;
    b = await repo.update(b);

    expect(a.step).toBe(2);
    expect(b.step).toBe(1);
  });
});
