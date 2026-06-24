import { BaseModel, Context, pk, table } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { NanoAdapter, NanoRepository } from "../../src";
import {
  createNanoTestResources,
  cleanupNanoTestResources,
} from "../helpers/nano";
import { nanoRepository } from "../helpers/repository";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

//
// REGRESSION TEST — Full cross-table database dump via Statement.raw()
//
// Previously CouchDBStatement.raw() forwarded the caller-supplied Mango query
// directly to adapter.raw() without adding the ??table discriminator that
// build() injects for execute(). Combined with allowRawStatements defaulting
// to true, a caller holding a single table's repository could dump every
// document in the database, including other tables' data.
//
// The fix: CouchDBStatement.raw() now scopes the incoming query to the
// statement's own table by forcing the ??table discriminator, so raw queries
// are table-isolated just like built queries.
//

@uses("nano")
@table("public_table")
@model()
class PublicModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  publicField!: string;

  constructor(arg?: ModelArg<PublicModel>) {
    super(arg);
  }
}

@uses("nano")
@table("restricted_table")
@model()
class RestrictedModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  restrictedSecret!: string;

  constructor(arg?: ModelArg<RestrictedModel>) {
    super(arg);
  }
}

describe("SECURITY (regression): cross-table dump via Statement.raw() is blocked", () => {
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let publicRepo: NanoRepository<PublicModel>;
  let restrictedRepo: NanoRepository<RestrictedModel>;

  function buildCtx() {
    return new Context().accumulate({
      allowRawStatements: true,
      rebuildWithTransient: true,
      ignoreHandlers: false,
      ignoreValidation: false,
      ignoreDevSafeGuards: false,
      mergeForUpdate: true,
      applyUpdateValidation: true,
      allowGenerationOverride: false,
      afterQueryHandlers: false,
      forcePrepareSimpleQueries: false,
      forcePrepareComplexQueries: false,
      paginateByBookmark: false,
    } as any);
  }

  beforeAll(async () => {
    resources = await createNanoTestResources("sec_rawdump_fix");
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
    await adapter.initialize();
    publicRepo = nanoRepository(PublicModel);
    restrictedRepo = nanoRepository(RestrictedModel);

    await restrictedRepo.create(
      new RestrictedModel({ id: 1, restrictedSecret: "TOP-SECRET-VALUE" })
    );
    await publicRepo.create(new PublicModel({ id: 1, publicField: "public" }));
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("does not dump other tables through an empty-selector raw query", async () => {
    // select() with no fields returns raw docs (no selectSelector), so we can
    // inspect the stored _id/??table to confirm only the own table is present.
    const everything: any[] = await publicRepo
      .select()
      .raw({ selector: {} }, buildCtx());

    const allDocs = JSON.stringify(everything);
    expect(allDocs).toContain("public_table"); // own table is returned
    expect(allDocs).not.toContain("TOP-SECRET-VALUE"); // restricted data is not
    expect(allDocs).not.toContain("restricted_table");

    // Only the public table's document should be present.
    expect(everything.length).toBe(1);
    expect((everything[0] as any)._id).toBe("public_table__1");
  });

  it("overrides a caller's attempt to target another table's discriminator", async () => {
    const restrictedRows: any[] = await publicRepo.select().raw(
      { selector: { "??table": "restricted_table" } },
      buildCtx()
    );

    // The ??table selector is overridden to the statement's own table, so the
    // caller cannot read restricted rows. At most the own-table docs come back.
    const allDocs = JSON.stringify(restrictedRows);
    expect(allDocs).not.toContain("TOP-SECRET-VALUE");
    expect(allDocs).not.toContain("restricted_table__");
    restrictedRows.forEach((r: any) => {
      expect(r._id).toContain("public_table");
    });
  });

  it("still returns own-table documents via raw with a field condition", async () => {
    const rows: any[] = await publicRepo.select().raw(
      { selector: { publicField: "public" } },
      buildCtx()
    );
    expect(rows.length).toBe(1);
    expect((rows[0] as any)._id).toBe("public_table__1");
  });
});
