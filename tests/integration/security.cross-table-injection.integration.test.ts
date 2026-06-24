import { BaseModel, column, Context, pk, table } from "@decaf-ts/core";
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
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

//
// REGRESSION TEST — Cross-Table Document Injection via @column("??table")
//
// Previously a model property mapped to "??table" (the per-document table
// discriminator) could overwrite that discriminator because:
//   1. @column() accepted any string with no reserved-name validation;
//   2. CouchDBAdapter.isReserved() only blocked /^_.*$/g, so "??table" passed;
//   3. createPrefix/updatePrefix set record["??table"] BEFORE Object.assign,
//      so the model value overwrote the real table name.
//
// The fix:
//   - isReserved() now also rejects the internal discriminator markers
//     (CouchDBKeys.TABLE / CouchDBKeys.SEQUENCE);
//   - createPrefix/createAllPrefix/updatePrefix/updateAllPrefix set the
//     discriminator fields AFTER Object.assign, so model data can never
//     overwrite them.
//
// These tests assert the exploit is no longer possible.
//

@uses("nano")
@table("secret_victim")
@model()
class VictimModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @required()
  secret!: string;

  constructor(arg?: ModelArg<VictimModel>) {
    super(arg);
  }
}

@uses("nano")
@table("attacker")
@model()
class AttackerModel extends BaseModel {
  @pk({ type: Number })
  id!: number;

  @column("secret")
  @required()
  payload!: string;

  // The would-be exploit: a property mapped to the discriminator key.
  @column(CouchDBKeys.TABLE)
  @required()
  smuggledTable!: string;

  constructor(arg?: ModelArg<AttackerModel>) {
    super(arg);
  }
}

describe("SECURITY (regression): cross-table injection via @column('??table') is blocked", () => {
  let adapter: NanoAdapter;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let victimRepo: NanoRepository<VictimModel>;
  let attackerRepo: NanoRepository<AttackerModel>;

  beforeAll(async () => {
    resources = await createNanoTestResources("sec_xtable_fix");
    adapter = new NanoAdapter({
      user: resources.user,
      password: resources.password,
      host: resources.host,
      dbName: resources.dbName,
      protocol: resources.protocol,
    });
    await adapter.initialize();
    victimRepo = nanoRepository(VictimModel);
    attackerRepo = nanoRepository(AttackerModel);
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  it("treats the discriminator field as reserved", () => {
    expect(adapter.isReserved(CouchDBKeys.TABLE)).toBe(true);
    expect(adapter.isReserved(CouchDBKeys.SEQUENCE)).toBe(true);
  });

  it("rejects creating a record whose @column maps to the discriminator", async () => {
    // prepare() throws before anything is written.
    await expect(
      attackerRepo.create(
        new AttackerModel({
          id: 7,
          payload: "attacker-controlled-value",
          smuggledTable: "secret_victim",
        })
      )
    ).rejects.toThrow(/reserved/i);
  });

  it("does not inject attacker documents into the victim table's query results", async () => {
    await victimRepo.create(new VictimModel({ id: 1, secret: "real-secret" }));

    // Any attempt to create the poisoned doc is rejected, so the victim query
    // only ever returns the real victim doc.
    await expect(
      attackerRepo.create(
        new AttackerModel({
          id: 7,
          payload: "evil",
          smuggledTable: "secret_victim",
        })
      )
    ).rejects.toThrow(/reserved/i);

    const results = await victimRepo.select().execute();
    const ids = results.map((r) => r.id);
    expect(ids).toEqual([1]);
    expect(results[0].secret).toBe("real-secret");
  });

  it("rejects preparing a record (create or update) mapping to the discriminator", () => {
    // adapter.prepare() is the shared gate for create and update. The update
    // CRUD path reads the old doc first (NotFound for a never-created record),
    // so we assert the guard directly here instead.
    const crafted = new AttackerModel({
      id: 7,
      payload: "evil",
      smuggledTable: "secret_victim",
    });
    expect(() => adapter.prepare(crafted, new Context())).toThrow(/reserved/i);
  });

  it("rejects bulk create of records mapping to the discriminator", async () => {
    await expect(
      attackerRepo.createAll([
        new AttackerModel({
          id: 11,
          payload: "bulk-evil",
          smuggledTable: "secret_victim",
        }),
        new AttackerModel({
          id: 12,
          payload: "bulk-evil-2",
          smuggledTable: "secret_victim",
        }),
      ])
    ).rejects.toThrow(/reserved/i);

    const results = await victimRepo.select().execute();
    expect(results.map((r) => r.id)).toEqual([1]);
  });
});
