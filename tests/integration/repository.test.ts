import { Model } from "@decaf-ts/decorator-validation";
import { repository, Repository } from "@decaf-ts/core";
import { CouchDBRepository } from "@decaf-ts/for-couchdb";
import { TestModel } from "../TestModel";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";
import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";
import { uses } from "@decaf-ts/decoration";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("repositories", () => {
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  beforeAll(async () => {
    resources = await createNanoTestResources("repository");
    expect(resources.connection).toBeDefined();
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: "http",
    });
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("instantiates via constructor", () => {
    const repo: NanoRepository<TestModel> = new CouchDBRepository(
      adapter as any,
      TestModel
    );
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(CouchDBRepository);
  });

  it("instantiates via Repository.get with @uses decorator on model", () => {
    uses("nano")(TestModel);
    const repo = Repository.forModel(TestModel);
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(Repository);
  });

  it("gets injected when using @repository", () => {
    class TestClass {
      @repository(TestModel)
      repo!: NanoRepository<TestModel>;
    }

    const testClass = new TestClass();
    expect(testClass).toBeDefined();
    expect(testClass.repo).toBeDefined();
    expect(testClass.repo).toBeInstanceOf(Repository);
  });
});
