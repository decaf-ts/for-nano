import { ServerScope } from "nano";
import {
  BaseModel,
  Condition,
  OrderDirection,
  pk,
  table,
  view,
} from "@decaf-ts/core";
import {
  list,
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { prop, uses } from "@decaf-ts/decoration";
import {
  CouchDBRepository,
  count,
  distinct,
  generateViews,
  groupBy,
  max,
  min,
  sum,
} from "@decaf-ts/for-couchdb";
import { ConflictError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "../../src";
import { NanoFlavour } from "../../src/constants";

const admin = "couchdb.admin";
const admin_password = "couchdb.admin";
const user = "couchdb.admin";
const user_password = "couchdb.admin";
const dbName = "test_view_db";
const dbHost = "localhost:10010";

Model.setBuilder(Model.fromModel);

function serializeCondition<T>(condition: Condition<T>) {
  return JSON.parse(JSON.stringify(condition));
}

@uses(NanoFlavour)
@table("view_test")
@model()
class ViewTestModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  @view({ name: "by_status", ddoc: "view_ddoc" })
  @view({
    name: "by_status_docs",
    ddoc: "view_ddoc",
    returnDocs: true,
    condition: JSON.parse(
      JSON.stringify(Condition.attribute<ViewTestModel>("status").eq("active"))
    ),
  })
  @view({
    name: "by_status_admin",
    ddoc: "auth_ddoc",
    auth: "doc.roles && doc.roles.indexOf('admin') !== -1",
  })
  @view({
    name: "by_status_admin_obj",
    ddoc: "auth_ddoc",
    auth: { roles: ["admin"], field: "roles" },
  })
  @view({
    name: "by_status_custom_map",
    ddoc: "custom_ddoc",
    map: "function (doc) { if (doc && doc.status) emit(doc.status, doc.amount); }",
    reduce: "_sum",
    key: "status",
    value: "amount",
  })
  @groupBy({ name: "group_by_status", ddoc: "view_ddoc" })
  @count({ name: "count_active", ddoc: "agg_ddoc", value: "active" })
  @count({
    name: "count_category_a",
    ddoc: "agg_ddoc",
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("category").eq("a")
    ),
  })
  @count({
    name: "count_active_docs",
    ddoc: "agg_ddoc",
    returnDocs: true,
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("status").eq("active")
    ),
  })
  @distinct({ name: "distinct_status", ddoc: "agg_ddoc" })
  status!: string;

  @required()
  @groupBy({
    name: "group_by_category",
    ddoc: "view_ddoc",
    compositions: ["status"],
    directions: [OrderDirection.ASC, OrderDirection.DSC],
  })
  @distinct({
    name: "distinct_category_a_docs",
    ddoc: "agg_ddoc",
    returnDocs: true,
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("category").eq("a")
    ),
  })
  category!: string;

  @required()
  @sum({ name: "sum_amount", ddoc: "agg_ddoc" })
  @sum({
    name: "sum_active_amount",
    ddoc: "agg_ddoc",
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("status").eq("active")
    ),
  })
  @max({ name: "max_amount", ddoc: "agg_ddoc" })
  @max({
    name: "max_category_b",
    ddoc: "agg_ddoc",
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("category").eq("b")
    ),
  })
  @min({ name: "min_amount", ddoc: "agg_ddoc" })
  @min({
    name: "min_category_a",
    ddoc: "agg_ddoc",
    condition: serializeCondition(
      Condition.attribute<ViewTestModel>("category").eq("a")
    ),
  })
  amount!: number;

  @prop()
  @list(String)
  roles?: string[];

  constructor(arg?: ModelArg<ViewTestModel>) {
    super(arg);
  }
}

jest.setTimeout(60000);

describe("Views Integration", () => {
  let con: ServerScope;
  let adapter: NanoAdapter;
  let repo: CouchDBRepository<ViewTestModel>;

  beforeAll(async () => {
    con = await NanoAdapter.connect(admin, admin_password, dbHost);
    try {
      await NanoAdapter.createDatabase(con, dbName);
      await NanoAdapter.createUser(con, dbName, user, user_password);
    } catch (e: any) {
      if (!(e instanceof ConflictError)) throw e;
    }
    adapter = new NanoAdapter({
      user,
      password: user_password,
      host: dbHost,
      dbName,
      protocol: "http",
    });
    await adapter.initialize();
    // Debug: ensure generator output matches design docs
    const generated = generateViews([ViewTestModel]);
    expect(generated.length).toBeGreaterThan(0);
    let aggDoc: any;
    let viewDoc: any;
    try {
      aggDoc = await adapter.client.get("_design/agg_ddoc");
      viewDoc = await adapter.client.get("_design/view_ddoc");
    } catch (e: any) {
      throw new Error(`Design doc missing: ${e?.reason || e?.message || e}`);
    }
    expect(Object.keys(aggDoc.views || {})).toContain("count_active");
    expect(Object.keys(viewDoc.views || {})).toContain("by_status");
    const authDoc = await adapter.client.get("_design/auth_ddoc");
    expect(Object.keys(authDoc.views || {})).toContain("by_status_admin");
    expect(Object.keys(authDoc.views || {})).toContain("by_status_admin_obj");
    expect(authDoc.views.by_status_admin_obj.map).toContain("roles");
    expect(authDoc.views.by_status_admin_obj.map).toContain("admin");
    const customDoc = await adapter.client.get("_design/custom_ddoc");
    expect(Object.keys(customDoc.views || {})).toContain(
      "by_status_custom_map"
    );
    repo = new CouchDBRepository(adapter, ViewTestModel);
  });

  afterAll(async () => {
    await NanoAdapter.deleteDatabase(con, dbName);
  });

  it("creates and queries views", async () => {
    const docs = [
      new ViewTestModel({
        id: 1,
        status: "active",
        category: "a",
        amount: 10,
        roles: ["admin"],
      }),
      new ViewTestModel({
        id: 2,
        status: "inactive",
        category: "a",
        amount: 5,
        roles: ["user"],
      }),
      new ViewTestModel({
        id: 3,
        status: "active",
        category: "b",
        amount: 7,
        roles: ["admin", "user"],
      }),
    ];

    for (const doc of docs) {
      await repo.create(doc);
    }

    const countActive = await adapter.client.view("agg_ddoc", "count_active", {
      reduce: true,
    });
    expect(countActive.rows[0].value).toBe(2);

    const countCategoryA = await adapter.client.view(
      "agg_ddoc",
      "count_category_a",
      { reduce: true }
    );
    expect(countCategoryA.rows[0].value).toBe(2);

    const countActiveDocs = await adapter.client.view(
      "agg_ddoc",
      "count_active_docs",
      { reduce: false }
    );
    expect(countActiveDocs.rows).toHaveLength(2);
    expect(
      countActiveDocs.rows.every((r: any) => r.value.status === "active")
    ).toBe(true);

    const distinctStatus = await adapter.client.view(
      "agg_ddoc",
      "distinct_status",
      { reduce: true, group: true }
    );
    const distinctKeys = distinctStatus.rows.map((r: any) => r.key).sort();
    expect(distinctKeys).toEqual(["active", "inactive"]);

    const groupedByStatus = await adapter.client.view(
      "view_ddoc",
      "group_by_status",
      { reduce: true, group: true }
    );
    const countsByStatus = groupedByStatus.rows.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      },
      {}
    );
    expect(countsByStatus).toEqual({ active: 2, inactive: 1 });

    const sumAmount = await adapter.client.view("agg_ddoc", "sum_amount", {
      reduce: true,
    });
    expect(sumAmount.rows[0].value).toBe(22);

    const sumActiveAmount = await adapter.client.view(
      "agg_ddoc",
      "sum_active_amount",
      { reduce: true }
    );
    expect(sumActiveAmount.rows[0].value).toBe(17);

    const maxAmount = await adapter.client.view("agg_ddoc", "max_amount", {
      reduce: true,
    });
    expect(maxAmount.rows[0].value).toBe(10);

    const maxCategoryB = await adapter.client.view(
      "agg_ddoc",
      "max_category_b",
      { reduce: true }
    );
    expect(maxCategoryB.rows[0].value).toBe(7);

    const minAmount = await adapter.client.view("agg_ddoc", "min_amount", {
      reduce: true,
    });
    expect(minAmount.rows[0].value).toBe(5);

    const minCategoryA = await adapter.client.view(
      "agg_ddoc",
      "min_category_a",
      { reduce: true }
    );
    expect(minCategoryA.rows[0].value).toBe(5);

    const byStatusDocs = await adapter.client.view(
      "view_ddoc",
      "by_status_docs",
      { reduce: false }
    );
    expect(byStatusDocs.rows.length).toBe(2);
    expect(byStatusDocs.rows[0].value.status).toBe("active");

    const byStatusAdmin = await adapter.client.view(
      "auth_ddoc",
      "by_status_admin",
      { reduce: false }
    );
    const adminStatuses = byStatusAdmin.rows.map((r: any) => r.value);
    expect(adminStatuses.length).toBe(2);
    expect(adminStatuses.every((s: string) => s === "active")).toBe(true);

    const customMap = await adapter.client.view(
      "custom_ddoc",
      "by_status_custom_map",
      { reduce: true, group: true }
    );
    const customSum = customMap.rows.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      },
      {}
    );
    expect(customSum).toEqual({ active: 17, inactive: 5 });

    const distinctCategoryDocs = await adapter.client.view(
      "agg_ddoc",
      "distinct_category_a_docs",
      { reduce: false }
    );
    expect(distinctCategoryDocs.rows).toHaveLength(2);
    expect(
      distinctCategoryDocs.rows.every(
        (r: any) => r.value.category === "a" && r.value.status
      )
    ).toBe(true);
  });
});
