import {
  ConflictError,
  Context,
  InternalError,
  onCreate,
} from "@decaf-ts/db-decorators";
import "reflect-metadata";
import {
  CouchDBAdapter,
  CouchDBKeys,
  CreateIndexRequest,
  generateIndexes,
  MangoQuery,
  MangoResponse,
} from "@decaf-ts/for-couchdb";
import Nano from "nano";
import {
  DocumentBulkResponse,
  DocumentGetResponse,
  DocumentInsertResponse,
  DocumentScope,
  MaybeDocument,
  ServerScope,
} from "nano";
import {
  Constructor,
  Decoration,
  Model,
  propMetadata,
} from "@decaf-ts/decorator-validation";
import { NanoFlags } from "./types";
import {
  PersistenceKeys,
  RelationsMetadata,
  Repo,
  Repository,
  UnsupportedError,
} from "@decaf-ts/core";

export async function createdByOnNanoCreateUpdate<
  M extends Model,
  R extends Repo<M, C, F>,
  V extends RelationsMetadata,
  F extends NanoFlags,
  C extends Context<NanoFlags>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const user = context.get("user");
  if (!user || !user.name)
    throw new UnsupportedError(
      "This adapter does not support user identification"
    );
  model[key] = user.name as M[typeof key];
}

const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);

Decoration.flavouredAs("nano")
  .for(createdByKey)
  .define(onCreate(createdByOnNanoCreateUpdate), propMetadata(createdByKey, {}))
  .apply();

Decoration.flavouredAs("nano")
  .for(updatedByKey)
  .define(onCreate(createdByOnNanoCreateUpdate), propMetadata(updatedByKey, {}))
  .apply();

export class NanoAdapter extends CouchDBAdapter<
  DocumentScope<any>,
  NanoFlags,
  Context<NanoFlags>
> {
  constructor(scope: DocumentScope<any>, flavour: string = "nano") {
    super(scope, flavour);
  }
  //
  // protected async user(): Promise<User> {
  //   if (this._user) return this._user;
  //
  //   try {
  //     const user: DatabaseSessionResponse = await this.native.session();
  //     this._user = new User({
  //       id: user.userCtx.name,
  //       roles: user.userCtx.roles,
  //       affiliations: user.userCtx.affiliations,
  //     });
  //   } catch (e: any) {
  //     throw this.parseError(e);
  //   }
  //   return this._user;
  // }

  protected async index<M extends Model>(
    ...models: Constructor<M>[]
  ): Promise<void> {
    const indexes: CreateIndexRequest[] = generateIndexes(models);
    for (const index of indexes) {
      const res = await this.native.createIndex(index);
      const { result, id, name } = res;
      if (result === "existing")
        throw new ConflictError(`Index for table ${name} with id ${id}`);
    }
  }

  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    let response: DocumentInsertResponse;
    try {
      response = await this.native.insert(model);
    } catch (e: any) {
      throw this.parseError(e);
    }

    if (!response.ok)
      throw new InternalError(
        `Failed to insert doc id: ${id} in table ${tableName}`
      );
    return this.assignMetadata(model, response.rev);
  }

  async createAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    let response: DocumentBulkResponse[];
    try {
      response = await this.native.bulk({ docs: models });
    } catch (e: any) {
      throw this.parseError(e);
    }
    if (!response.every((r) => !r.error)) {
      const errors = response.reduce((accum: string[], el, i) => {
        if (el.error)
          accum.push(
            `el ${i}: ${el.error}${el.reason ? ` - ${el.reason}` : ""}`
          );
        return accum;
      }, []);
      throw new InternalError(errors.join("\n"));
    }

    return this.assignMultipleMetadata(
      models,
      response.map((r) => r.rev as string)
    );
  }

  async read(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const _id = this.generateId(tableName, id);
    let record: DocumentGetResponse;
    try {
      record = await this.native.get(_id);
    } catch (e: any) {
      throw this.parseError(e);
    }
    return this.assignMetadata(record, record._rev);
  }

  async readAll(
    tableName: string,
    ids: (string | number | bigint)[]
  ): Promise<Record<string, any>[]> {
    const results = await this.native.fetch(
      { keys: ids.map((id) => this.generateId(tableName, id as any)) },
      {}
    );
    return results.rows.map((r) => {
      if ((r as any).error) throw new InternalError((r as any).error);
      if ((r as any).doc) {
        const res = Object.assign({}, (r as any).doc);
        return this.assignMetadata(res, (r as any).doc[CouchDBKeys.REV]);
      }
      throw new InternalError("Should be impossible");
    });
  }

  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    let response: DocumentInsertResponse;
    try {
      response = await this.native.insert(model);
    } catch (e: any) {
      throw this.parseError(e);
    }

    if (!response.ok)
      throw new InternalError(
        `Failed to update doc id: ${id} in table ${tableName}`
      );
    return this.assignMetadata(model, response.rev);
  }

  async updateAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    let response: DocumentBulkResponse[];
    try {
      response = await this.native.bulk({ docs: models });
    } catch (e: any) {
      throw this.parseError(e);
    }
    if (!response.every((r) => !r.error)) {
      const errors = response.reduce((accum: string[], el, i) => {
        if (el.error)
          accum.push(
            `el ${i}: ${el.error}${el.reason ? ` - ${el.reason}` : ""}`
          );
        return accum;
      }, []);
      throw new InternalError(errors.join("\n"));
    }

    return this.assignMultipleMetadata(
      models,
      response.map((r) => r.rev as string)
    );
  }

  async delete(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const _id = this.generateId(tableName, id);
    let record: DocumentGetResponse;
    try {
      record = await this.native.get(_id);
      await this.native.destroy(_id, record._rev);
    } catch (e: any) {
      throw this.parseError(e);
    }
    return this.assignMetadata(record, record._rev);
  }

  async deleteAll(
    tableName: string,
    ids: (string | number | bigint)[]
  ): Promise<Record<string, any>[]> {
    const results = await this.native.fetch(
      { keys: ids.map((id) => this.generateId(tableName, id as any)) },
      {}
    );
    const deletion: DocumentBulkResponse[] = await this.native.bulk({
      docs: results.rows.map((r) => {
        (r as any)[CouchDBKeys.DELETED] = true;
        return r;
      }),
    });
    deletion.forEach((d: DocumentBulkResponse) => {
      if (d.error) console.error(d.error);
    });
    return results.rows.map((r) => {
      if ((r as any).error) throw new InternalError((r as any).error);
      if ((r as any).doc) {
        const res = Object.assign({}, (r as any).doc);
        return this.assignMetadata(res, (r as any).doc[CouchDBKeys.REV]);
      }
      throw new InternalError("Should be impossible");
    });
  }

  async raw<V>(rawInput: MangoQuery, process = true): Promise<V> {
    try {
      const response: MangoResponse<V> = await this.native.find(rawInput);
      if (response.warning) console.warn(response.warning);
      if (process) return response.docs as V;
      return response as V;
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  static connect(
    user: string,
    pass: string,
    host = "localhost:5984",
    protocol: "http" | "https" = "http"
  ): ServerScope {
    return Nano(`${protocol}://${user}:${pass}@${host}`);
  }

  static async createDatabase(con: ServerScope, name: string) {
    let result: any;
    try {
      result = await con.db.create(name);
    } catch (e: any) {
      throw CouchDBAdapter.parseError(e);
    }
    const { ok, error, reason } = result;
    if (!ok) throw CouchDBAdapter.parseError(error as string, reason);
  }

  static async deleteDatabase(con: ServerScope, name: string) {
    let result;
    try {
      result = await con.db.destroy(name);
    } catch (e: any) {
      throw CouchDBAdapter.parseError(e);
    }
    const { ok } = result;
    if (!ok)
      throw new InternalError(`Failed to delete database with name ${name}`);
  }

  static async createUser(
    con: ServerScope,
    dbName: string,
    user: string,
    pass: string,
    roles: string[] = ["reader", "writer"]
  ) {
    const users = con.db.use("_users");
    const usr = {
      _id: "org.couchdb.user:" + user,
      name: user,
      password: pass,
      roles: roles,
      type: "user",
    };
    try {
      const created: DocumentInsertResponse = await users.insert(
        usr as MaybeDocument
      );
      const { ok } = created;
      if (!ok) throw new InternalError(`Failed to create user ${user}`);
      const security: any = await con.request({
        db: dbName,
        method: "put",
        path: "_security",
        // headers: {
        //
        // },
        body: {
          admins: {
            names: [user],
            roles: [],
          },
          members: {
            names: [user],
            roles: roles,
          },
        },
      });
      if (!security.ok)
        throw new InternalError(
          `Failed to authorize user ${user} to db ${dbName}`
        );
    } catch (e: any) {
      throw CouchDBAdapter.parseError(e);
    }
  }

  static async deleteUser(con: ServerScope, dbName: string, user: string) {
    const users = con.db.use("_users");
    const id = "org.couchdb.user:" + user;
    try {
      const usr = await users.get(id);
      await users.destroy(id, usr._rev);
    } catch (e: any) {
      throw CouchDBAdapter.parseError(e);
    }
  }
}
