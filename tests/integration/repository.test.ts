import { Model } from "@decaf-ts/decorator-validation";
import { ServerScope } from "nano";
import { repository, Repository } from "@decaf-ts/core";
import { CouchDBRepository } from "@decaf-ts/for-couchdb";
import { TestModel } from "../TestModel";
import { ConflictError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";
import { NanoRepository } from "../../src";
import { uses } from "@decaf-ts/decoration";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "repository_db";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("repositories", () => {
  let con: ServerScope;
  let adapter: NanoAdapter;

  beforeAll(async () => {
    con = NanoAdapter.connect(admin, admin_password, dbHost);
    expect(con).toBeDefined();
    try {
      await NanoAdapter.createDatabase(con, dbName);
      await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    adapter = new NanoAdapter({
      user: user,
      password: user_password,
      host: dbHost,
      dbName: dbName,
    });
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
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
