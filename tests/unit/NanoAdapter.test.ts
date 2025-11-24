import {
  Context,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src/adapter";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";
import { PersistenceKeys } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";

function makeAdapter(overrides: any = {}) {
  const cfg = { user: "u", password: "p", host: "h", dbName: "db" } as any;
  const adp = new NanoAdapter(cfg, `test-${Math.random()}`);
  // inject fake client
  (adp as any)._client = {
    insert: jest.fn(),
    bulk: jest.fn(),
    get: jest.fn(),
    fetch: jest.fn(),
    destroy: jest.fn(),
    createIndex: jest.fn(),
    find: jest.fn(),
    ...overrides,
  };
  return adp as any as NanoAdapter;
}

function ctx() {
  return Context.factory({
    logger: Logging.get(),
    operation: OperationKeys.CREATE,
  } as any);
}

describe("NanoAdapter core methods", () => {
  test("flags merges user", async () => {
    const adp = makeAdapter();
    const res: any = await (adp as any).flags(
      OperationKeys.CREATE,
      class {},
      {}
    );
    expect(res.user).toEqual({ name: "u" });
  });

  test("Dispatch returns NanoDispatch", () => {
    const adp = makeAdapter();
    const d = (adp as any).Dispatch();
    expect(d.constructor.name).toBe("NanoDispatch");
  });

  test("create ok=false throws InternalError", async () => {
    const adp = makeAdapter({
      insert: jest.fn().mockResolvedValue({ ok: false }),
    });
    await expect(adp.create("t", "1", { a: 1 }, ctx())).rejects.toThrow(
      InternalError
    );
  });

  test("create success assigns metadata", async () => {
    const adp = makeAdapter({
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "2-a" }),
    });
    const m: any = await adp.create("t", "1", { a: 1 }, ctx());
    expect(m[CouchDBKeys.REV]).toBeUndefined(); // should not copy as field
    expect((m as any)[PersistenceKeys.METADATA]).toBe("2-a");
  });

  test("createAll aggregates errors from bulk", async () => {
    const adp = makeAdapter({
      bulk: jest.fn().mockResolvedValue([
        { ok: true, id: "a", rev: "1-a" },
        { ok: false, error: "conflict", reason: "exists" },
      ]),
    });
    await expect(
      adp.createAll("t", ["1", "2"], [{}, {}], ctx())
    ).rejects.toThrow(/conflict/);
  });

  test("update ok=false throws InternalError", async () => {
    const adp = makeAdapter({
      insert: jest.fn().mockResolvedValue({ ok: false }),
    });
    await expect(adp.update("t", "1", { a: 1 }, ctx())).rejects.toThrow(
      InternalError
    );
  });

  test("updateAll aggregates errors from bulk", async () => {
    const adp = makeAdapter({
      bulk: jest.fn().mockResolvedValue([
        { ok: true, id: "a", rev: "1-a" },
        { ok: false, error: "bad" },
      ]),
    });
    // updateAllPrefix requires revision metadata in models
    const m1: any = {};
    const m2: any = {};
    // assign metadata as adapter does
    Object.defineProperty(m1, PersistenceKeys.METADATA, { value: "1-a" });
    Object.defineProperty(m2, PersistenceKeys.METADATA, { value: "1-b" });
    await expect(
      adp.updateAll("t", ["1", "2"], [m1, m2], ctx())
    ).rejects.toThrow(/bad/);
  });

  test("read returns assigned metadata", async () => {
    const adp = makeAdapter({
      get: jest.fn().mockResolvedValue({ _rev: "5-x", a: 1 }),
    });
    const r = await adp.read("users", "1", ctx());
    expect((r as any)[PersistenceKeys.METADATA]).toBe("5-x");
  });

  test("readAll maps results and throws on error rows", async () => {
    const adp = makeAdapter({
      fetch: jest.fn().mockResolvedValue({
        rows: [
          { error: "not_found" },
          { doc: { _rev: "2-z", [CouchDBKeys.REV]: "2-z", a: 1 } },
        ],
      }),
    });
    await expect(adp.readAll("users", ["1", "2"], ctx())).rejects.toThrow(
      InternalError
    );
  });

  test("delete returns deleted doc metadata", async () => {
    const adp = makeAdapter({
      get: jest.fn().mockResolvedValue({ _rev: "9-a", a: 1 }),
      destroy: jest.fn().mockResolvedValue({ ok: true }),
    });
    const r = await adp.delete("users", "1", ctx());
    expect((r as any)[PersistenceKeys.METADATA]).toBe("9-a");
  });

  test("deleteAll maps docs and flags _deleted", async () => {
    const bulkSpy = jest.fn().mockResolvedValue([{ ok: true }, { ok: true }]);
    const adp = makeAdapter({
      fetch: jest.fn().mockResolvedValue({
        rows: [
          { doc: { _rev: "1-a", [CouchDBKeys.REV]: "1-a", a: 1 } },
          { doc: { _rev: "1-b", [CouchDBKeys.REV]: "1-b", b: 2 } },
        ],
      }),
      bulk: bulkSpy,
    });
    const res = await adp.deleteAll("users", ["1", "2"], ctx());
    expect(res).toHaveLength(2);
    // verify we set _deleted flags in bulk call payload
    const arg = bulkSpy.mock.calls[0][0].docs;
    expect(arg[0]._deleted).toBe(true);
    expect(arg[1]._deleted).toBe(true);
  });

  test("raw returns docsOnly and full response with warning", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const adp = makeAdapter({
      find: jest.fn().mockResolvedValue({ docs: [1, 2], warning: "w" }),
    });
    const docs = await adp.raw<any>({} as any, true, ctx());
    expect(docs).toEqual([1, 2]);
    const full = await adp.raw<any>({} as any, false, ctx());
    expect(full.docs).toEqual([1, 2]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("NanoAdapter static helpers", () => {
  test("connect builds proper URL", () => {
    // Monkey patch global Nano function to capture URL.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/no-require-imports
    const orig = require("nano");
    const mock = jest.fn();
    jest.resetModules();
    jest.doMock("nano", () => mock, { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NanoAdapter: NA } = require("../../src/adapter");
    NA.connect("a", "b", "h:1", "https");
    expect(mock).toHaveBeenCalledWith("https://a:b@h:1");
    jest.dontMock("nano");
  });

  test("createDatabase throws on ok=false and deleteDatabase ok=false", async () => {
    const con: any = {
      db: {
        create: jest
          .fn()
          .mockResolvedValue({ ok: false, error: "e", reason: "r" }),
        destroy: jest.fn().mockResolvedValue({ ok: false }),
      },
    };
    await expect(
      NanoAdapter.createDatabase(con as any, "db")
    ).rejects.toThrow();
    await expect(NanoAdapter.deleteDatabase(con as any, "db")).rejects.toThrow(
      InternalError
    );
  });

  test("createUser success path and deleteUser", async () => {
    const users = {
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }),
      get: jest.fn().mockResolvedValue({ _rev: "1-a" }),
      destroy: jest.fn().mockResolvedValue({ ok: true }),
    };
    const con: any = {
      db: { use: jest.fn().mockReturnValue(users) },
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    await NanoAdapter.createUser(con as any, "db", "usr", "pwd");
    await NanoAdapter.deleteUser(con as any, "db", "usr");
    expect(con.db.use).toHaveBeenCalledWith("_users");
    expect(con.request).toHaveBeenCalled();
  });
});

// Additional coverage tests
describe("NanoAdapter additional coverage", () => {
  test("createAll success assigns multiple metadata", async () => {
    const adp = makeAdapter({
      bulk: jest.fn().mockResolvedValue([
        { ok: true, id: "a", rev: "1-a" },
        { ok: true, id: "b", rev: "2-b" },
      ]),
    });
    const models = [{ a: 1 }, { b: 2 }];
    const res = await adp.createAll("t", ["1", "2"], models, ctx());
    expect((res[0] as any)[PersistenceKeys.METADATA]).toBe("1-a");
    expect((res[1] as any)[PersistenceKeys.METADATA]).toBe("2-b");
  });

  test("update success assigns metadata", async () => {
    const adp = makeAdapter({
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "3-zz" }),
    });
    const m: any = {};
    Object.defineProperty(m, PersistenceKeys.METADATA, { value: "2-yy" });
    const r = await adp.update("t", "1", m, ctx());
    expect((r as any)[PersistenceKeys.METADATA]).toBe("3-zz");
  });

  test("readAll success maps docs and assigns metadata", async () => {
    const adp = makeAdapter({
      fetch: jest.fn().mockResolvedValue({
        rows: [
          { doc: { _rev: "1-a", [CouchDBKeys.REV]: "1-a", a: 1 } },
          { doc: { _rev: "2-b", [CouchDBKeys.REV]: "2-b", b: 2 } },
        ],
      }),
    });
    const res = await adp.readAll("users", ["1", "2"], ctx());
    expect((res[0] as any)[PersistenceKeys.METADATA]).toBe("1-a");
    expect((res[1] as any)[PersistenceKeys.METADATA]).toBe("2-b");
  });

  test("shutdown clears client", async () => {
    const adp = makeAdapter();
    expect((adp as any)._client).toBeDefined();
    await adp.shutdown();
    expect((adp as any)._client).toBeUndefined();
  });

  test("createDatabase and deleteDatabase success", async () => {
    const con: any = {
      db: {
        create: jest.fn().mockResolvedValue({ ok: true }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      },
    };
    await expect(
      NanoAdapter.createDatabase(con as any, "db")
    ).resolves.toBeUndefined();
    await expect(
      NanoAdapter.deleteDatabase(con as any, "db")
    ).resolves.toBeUndefined();
  });
});

// createdByOnNanoCreateUpdate helper
import { createdByOnNanoCreateUpdate } from "../../src/adapter";
import type { Context } from "@decaf-ts/db-decorators";

describe("createdByOnNanoCreateUpdate", () => {
  test("sets created_by from context user", async () => {
    const ctx = {
      get: () => ({ name: "tester" }),
    } as unknown as Context<any>;
    const model: any = {};
    await createdByOnNanoCreateUpdate.call(
      {} as any,
      ctx,
      {} as any,
      "created_by" as any,
      model
    );
    expect(model.created_by).toBe("tester");
  });
  test("throws UnsupportedError when no user in context", async () => {
    const ctx = {
      get: () => {
        throw new Error("nope");
      },
    } as unknown as Context<any>;
    const model: any = {};
    await expect(
      createdByOnNanoCreateUpdate.call(
        {} as any,
        ctx,
        {} as any,
        "created_by" as any,
        model
      )
    ).rejects.toThrow();
  });
});
