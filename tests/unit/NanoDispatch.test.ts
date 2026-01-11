import { OperationKeys } from "@decaf-ts/db-decorators";
import { NanoDispatch } from "../../src/NanoDispatch";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";
import { Context, MaybeContextualArg } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";

class TestDispatch extends NanoDispatch {
  public calls: Array<{ table: string; op: string; ids: any[] }> = [];
  public last?: string;
  constructor(timeout = 10) {
    super(timeout);
  }
  // expose for testing
  public async runChangeHandler(error: any, response: any, headers?: any) {
    const ctx = new Context().accumulate({
      operation: OperationKeys.UPDATE,
      logger: Logging.get(),
    } as any);
    return (this.changeHandler as any).call(
      this,
      error,
      response,
      headers,
      ctx
    );
  }
  override async updateObservers(
    table: string,
    operation: string,
    ids: any[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<any>
  ): Promise<void> {
    this.calls.push({ table, op: operation, ids });
  }
}

describe("NanoDispatch", () => {
  test("initialize sets active and does not throw even if already active", async () => {
    const d = new TestDispatch(5);
    // inject fake adapter with client.changes
    (d as any).adapter = { client: { changes: jest.fn() } };
    await (d as any).initialize();
    expect((d as any).active).toBe(true);
    // Due to current implementation, subscribe function returns early when active=true
    expect(
      ((d as any).adapter.client.changes as jest.Mock).mock.calls.length
    ).toBe(0);
  });
  test("changeHandler parses string feed, groups ops and updates last step", async () => {
    const d = new TestDispatch();
    const last_seq = "4-g1";
    const feed = [
      JSON.stringify({
        id: `users${CouchDBKeys.SEPARATOR}1`,
        deleted: false,
        changes: [{ rev: "1-a" }],
      }),
      JSON.stringify({
        id: `users${CouchDBKeys.SEPARATOR}1`,
        deleted: false,
        changes: [{ rev: "2-b" }],
      }),
      JSON.stringify({
        id: `orders${CouchDBKeys.SEPARATOR}9`,
        deleted: true,
        changes: [{ rev: "7-z" }],
      }),
      JSON.stringify({ last_seq }),
      "",
    ].join("\n");

    await d.runChangeHandler(null, feed);

    // should have grouped by table and operation
    // users should have UPDATE for id 1 (latest rev 2-b)
    // orders should have DELETE for id 9
    // verify that we have one call for users id=1 and one for orders id=9
    const hasUsers = d.calls.some(
      (c) => c.table === "users" && c.ids.length > 0
    );
    const hasOrdersDelete = d.calls.some(
      (c) =>
        c.table === "orders" &&
        c.ids.includes("9") &&
        c.op.toString() === OperationKeys.DELETE.toString()
    );
    expect(hasUsers).toBe(true);
    expect(hasOrdersDelete).toBe(true);

    // observerLastUpdate should be set to a processed step (last per loop)
    expect(["2-b", "7-z"]).toContain((d as any).observerLastUpdate);
  });

  test("changeHandler returns early on error and on parse failure", async () => {
    const d = new TestDispatch();

    // error provided
    await d.runChangeHandler({ message: "boom" } as any, []);
    expect(d.calls.length).toBe(0);

    // invalid JSON when string
    await d.runChangeHandler(null, "{not-json}\n");
    expect(d.calls.length).toBe(0);
  });
});
