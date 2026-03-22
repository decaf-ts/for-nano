import { Observer } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { ConflictError } from "@decaf-ts/db-decorators";
import { NanoAdapter, NanoRepository } from "../../src";
import { NanoDispatch } from "../../src/NanoDispatch";
import { TestModel } from "../TestModel";
import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("NanoDispatch integration", () => {
  let adapter: NanoAdapter;
  let repo: NanoRepository<TestModel>;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  beforeAll(async () => {
    resources = await createNanoTestResources("dispatch");
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
    await adapter.initialize();
    repo = new NanoRepository(adapter, TestModel);
  });

  afterAll(async () => {
    await adapter.shutdown();
    await cleanupNanoTestResources(resources);
  });

  it("marks the dispatch active when observing and flips when closed", async () => {
    const observer: Observer = {
      refresh: () => Promise.resolve(),
    };
    const unobserve = repo.observe(observer);

    const dispatch = (adapter as any).dispatch as NanoDispatch;
    expect(dispatch).toBeDefined();
    expect((dispatch as any).active).toBe(true);
    await dispatch.close();
    expect((dispatch as any).changeFeed).toBeUndefined();
    expect((dispatch as any).active).toBe(false);

    unobserve();
  });

  it("keeps proxied adapters working", async () => {
    const proxiedRepo = repo.for({
      host: resources.host,
      protocol: resources.protocol,
    }) as NanoRepository<TestModel>;
    const model = new TestModel({
      id: Date.now(),
      name: "proxied",
      nif: "000000000",
    });

    let created;
    try {
      created = await proxiedRepo.create(model);
    } catch (error) {
      if (error instanceof ConflictError) {
        created = await proxiedRepo.create(model);
      } else {
        throw error;
      }
    }
    expect(created).toBeDefined();

    const read = await proxiedRepo.read(created.id as number);
    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true);

    await proxiedRepo.delete(created.id as number);
  });

  it("reinitializes the dispatch when new observers attach", async () => {
    let dispatch = (adapter as any).dispatch as NanoDispatch;
    const firstObserver: Observer = { refresh: () => Promise.resolve() };
    const firstUnobserve = repo.observe(firstObserver);

    await dispatch.close();
    expect((dispatch as any).active).toBe(false);
    firstUnobserve();

    (adapter as any).dispatch = undefined;
    const secondObserver: Observer = { refresh: () => Promise.resolve() };
    const secondUnobserve = repo.observe(secondObserver);
    dispatch = (adapter as any).dispatch as NanoDispatch;
    const waitForReactivation = async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if ((dispatch as any).active) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("dispatch did not reactivate");
    };
    await waitForReactivation();
    expect((dispatch as any).active).toBe(true);
    secondUnobserve();

    await dispatch.close();
    expect((dispatch as any).active).toBe(false);
  });

  it("supports proxied adapters configured via for()", async () => {
    const standaloneAdapter = new NanoAdapter(
      {
        user: resources.user,
        password: resources.password,
        host: resources.host,
        dbName: resources.dbName,
        protocol: resources.protocol,
      },
      "nano-proxy-test"
    );
    await standaloneAdapter.initialize();

    const proxiedAdapter = standaloneAdapter.for({
      somethingInconsequential: "asdasd",
    });
    const proxiedRepo = new NanoRepository(
      proxiedAdapter,
      TestModel
    );
    const model = new TestModel({
      id: Date.now(),
      name: "adapter-proxy",
      nif: "999999999",
    });

    const created = await proxiedRepo.create(model);
    expect(created).toBeDefined();

    const read = await proxiedRepo.read(created.id as number);
    expect(read).toBeDefined();
    expect(read.equals(created)).toBe(true);

    await proxiedRepo.delete(created.id as number);
    await proxiedAdapter.shutdown();
  });
});
