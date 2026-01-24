import { uses } from "@decaf-ts/decoration";
import { Adapter } from "@decaf-ts/core";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { createdBy, Observer, pk, Repository } from "@decaf-ts/core";
import { NanoAdapter, NanoFlavour } from "../../src/index";
import { cleanupNanoTestResources } from "../helpers/nano";
import { setupNanoAdapter } from "../helpers/nanoSetup";

@uses(RamFlavour)
@model()
class Model1 extends Model {
  @pk({ type: Number, generated: true })
  id1!: number;

  @required()
  name1!: string;

  @createdBy()
  owner1!: string;

  constructor(arg?: ModelArg<Model1>) {
    super(arg);
  }
}
@uses(NanoFlavour)
@model()
class Model2 extends Model {
  @pk({ type: Number, generated: true })
  id2!: number;

  @required()
  name2!: string;

  @createdBy()
  owner2!: string;

  constructor(arg?: ModelArg<Model2>) {
    super(arg);
  }
}

jest.setTimeout(50000);

describe("Adapter Integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: NanoAdapter;
  let testUser: string;
  // let repo: NanoRepository<TestModel>;
  let setup: Awaited<ReturnType<typeof setupNanoAdapter>>;

  beforeAll(async () => {
    setup = await setupNanoAdapter("multi_flavour");
    adapter = setup.adapter;
    testUser = setup.resources.user;
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let observer: Observer;
  let mock: any;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();
    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    // repo.observe(observer);
  });

  afterEach(() => {
    // repo.unObserve(observer);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(setup.resources);
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let ram1: RamAdapter;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let ram2: NanoAdapter;

  it("initializes adapters correctly", () => {
    ram1 = new RamAdapter();
  });

  it("Reads default flavour correctly", async () => {
    const repo1 = Repository.forModel(Model1);
    expect(repo1).toBeDefined();
    expect(repo1["adapter"]).toBeInstanceOf(RamAdapter);
    const repo2 = Repository.forModel(Model2);
    expect(repo2).toBeDefined();
    expect(repo2["adapter"]).toBeInstanceOf(NanoAdapter);
    const created1 = await repo1.create(
      new Model1({
        name1: "test1",
      })
    );

    expect(created1).toBeDefined();
    expect(created1.hasErrors()).toBeUndefined();
    expect(created1.owner1).toEqual(expect.any(String));

    const created2 = await repo2.create(
      new Model2({
        name2: "test2",
      })
    );

    expect(created2).toBeDefined();
    expect(created2.hasErrors()).toBeUndefined();
    expect(created2.owner2).toEqual(testUser);
  });
});
