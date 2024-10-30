import { InternalError } from "@decaf-ts/db-decorators";
import "reflect-metadata";
import {
  CouchDBAdapter,
  DatabaseSessionResponse,
  DocumentInsertResponse,
  MaybeDocument,
} from "@decaf-ts/for-couchdb";
import * as Nano from "nano";
import { DocumentScope, ServerScope } from "nano";
import { User } from "@decaf-ts/core";

export class NanoAdapter extends CouchDBAdapter {
  constructor(scope: DocumentScope<any>, flavour: string) {
    super(scope, flavour);
  }

  async user(): Promise<User> {
    try {
      const user: DatabaseSessionResponse = await this.native.server.session();
      return new User({
        id: user.userCtx.name,
        roles: user.userCtx.roles,
        affiliations: user.userCtx.affiliations,
      });
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
    const users = await con.db.use("_users");
    const id = "org.couchdb.user:" + user;
    try {
      const usr = await users.get(id);
      await users.destroy(id, usr._rev);
    } catch (e: any) {
      throw CouchDBAdapter.parseError(e);
    }
  }
}
