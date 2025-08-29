import {
  ConflictError,
  Context,
  InternalError,
  onCreate,
  OperationKeys,
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
  Adapter,
  PersistenceKeys,
  RelationsMetadata,
  Repository,
  UnsupportedError,
} from "@decaf-ts/core";
import { NanoFlavour } from "./constants";
import { NanoRepository } from "./NanoRepository";
import { NanoDispatch } from "./NanoDispatch";

/**
 * @description Sets the creator or updater field in a model based on the user in the context
 * @summary Callback function used in decorators to automatically set the created_by or updated_by fields
 * with the username from the context when a document is created or updated
 * @template M - Type extending Model
 * @template R - Type extending NanoRepository<M>
 * @template V - Type extending RelationsMetadata
 * @param {R} this - The repository instance
 * @param {Context<NanoFlags>} context - The operation context containing user information
 * @param {V} data - The relation metadata
 * @param key - The property key to set with the username
 * @param {M} model - The model instance being created or updated
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function createdByOnNanoCreateUpdate
 * @memberOf module:for-nano
 * @mermaid
 * sequenceDiagram
 *   participant F as createdByOnNanoCreateUpdate
 *   participant C as Context
 *   participant M as Model
 *   F->>C: get("user")
 *   C-->>F: user object
 *   F->>M: set key to user.name
 *   Note over F: If no user in context
 *   F-->>F: throw UnsupportedError
 */
export async function createdByOnNanoCreateUpdate<
  M extends Model,
  R extends NanoRepository<M>,
  V extends RelationsMetadata,
>(
  this: R,
  context: Context<NanoFlags>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  try {
    const user = context.get("user");
    model[key] = user.name as M[typeof key];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    throw new UnsupportedError(
      "No User found in context. Please provide a user in the context"
    );
  }
}

/**
 * @description Adapter for interacting with Nano databases
 * @summary Provides a standardized interface for performing CRUD operations on Nano databases,
 * extending the CouchDB adapter with Nano-specific functionality. This adapter handles document
 * creation, reading, updating, and deletion, as well as bulk operations and index management.
 * @template DocumentScope - The Nano document scope type
 * @template NanoFlags - Configuration flags for Nano operations
 * @template Context - Context type for operations
 * @param {DocumentScope<any>} scope - The Nano document scope to use for database operations
 * @param {string} [alias] - Optional alias for the adapter
 * @class NanoAdapter
 * @example
 * ```typescript
 * // Connect to a Nano database
 * const server = NanoAdapter.connect('admin', 'password', 'localhost:5984');
 * const db = server.db.use('my_database');
 *
 * // Create an adapter instance
 * const adapter = new NanoAdapter(db);
 *
 * // Use the adapter for database operations
 * const document = await adapter.read('users', '123');
 * ```
 * @mermaid
 * classDiagram
 *   class CouchDBAdapter {
 *     +flags()
 *     +Dispatch()
 *     +index()
 *     +create()
 *     +read()
 *     +update()
 *     +delete()
 *   }
 *   class NanoAdapter {
 *     +flags()
 *     +Dispatch()
 *     +index()
 *     +create()
 *     +createAll()
 *     +read()
 *     +readAll()
 *     +update()
 *     +updateAll()
 *     +delete()
 *     +deleteAll()
 *     +raw()
 *     +static connect()
 *     +static createDatabase()
 *     +static deleteDatabase()
 *     +static createUser()
 *     +static deleteUser()
 *     +static decoration()
 *   }
 *   CouchDBAdapter <|-- NanoAdapter
 */
export class NanoAdapter extends CouchDBAdapter<
  DocumentScope<any>,
  NanoFlags,
  Context<NanoFlags>
> {
  constructor(scope: DocumentScope<any>, alias?: string) {
    super(scope, NanoFlavour, alias);
  }

  /**
   * @description Generates flags for database operations
   * @summary Creates a set of flags for a specific operation, including user information
   * @template M - Type extending Model
   * @param {OperationKeys} operation - The operation being performed (create, read, update, delete)
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<NanoFlags>} flags - Partial flags to be merged
   * @return {Promise<NanoFlags>} Complete flags for the operation
   */
  protected override async flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<NanoFlags>
  ): Promise<NanoFlags> {
    return Object.assign(await super.flags(operation, model, flags), {
      user: {
        name: this.native.config.url.split("@")[0].split(":")[0],
      },
    }) as NanoFlags;
  }

  /**
   * @description Creates a new NanoDispatch instance
   * @summary Returns a dispatcher for handling Nano-specific operations
   * @return {NanoDispatch} A new NanoDispatch instance
   */
  protected override Dispatch(): NanoDispatch {
    return new NanoDispatch();
  }

  /**
   * @description Creates database indexes for models
   * @summary Generates and creates indexes in the Nano database based on the provided models
   * @template M - Type extending Model
   * @param models - Model constructors to create indexes for
   * @return {Promise<void>} A promise that resolves when all indexes are created
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant G as generateIndexes
   *   participant DB as Nano Database
   *   A->>G: generateIndexes(models)
   *   G-->>A: indexes
   *   loop For each index
   *     A->>DB: createIndex(index)
   *     DB-->>A: response
   *     Note over A: Check if index already exists
   *     alt Index exists
   *       A-->>A: throw ConflictError
   *     end
   *   end
   */
  protected override async index<M extends Model>(
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

  /**
   * @description Creates a new document in the database
   * @summary Inserts a new document into the Nano database with the provided data
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The document identifier
   * @param {Record<string, any>} model - The document data to insert
   * @return {Promise<Record<string, any>>} A promise that resolves to the created document with metadata
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Database
   *   A->>DB: insert(model)
   *   alt Success
   *     DB-->>A: response with ok=true
   *     A->>A: assignMetadata(model, response.rev)
   *     A-->>A: return document with metadata
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   else Not OK
   *     DB-->>A: response with ok=false
   *     A-->>A: throw InternalError
   *   end
   */
  override async create(
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

  /**
   * @description Creates multiple documents in the database
   * @summary Inserts multiple documents into the Nano database in a single bulk operation
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of document identifiers
   * @param models - Array of document data to insert
   * @return A promise that resolves to an array of created documents with metadata
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Database
   *   A->>DB: bulk({docs: models})
   *   alt Success
   *     DB-->>A: response array
   *     A->>A: Check if all responses have no errors
   *     alt All OK
   *       A->>A: assignMultipleMetadata(models, revs)
   *       A-->>A: return documents with metadata
   *     else Some errors
   *       A->>A: Collect error messages
   *       A-->>A: throw InternalError with collected messages
   *     end
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   end
   */
  override async createAll(
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

  /**
   * @description Retrieves a document from the database
   * @summary Fetches a single document from the Nano database by its ID
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The document identifier
   * @return {Promise<Record<string, any>>} A promise that resolves to the retrieved document with metadata
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Database
   *   A->>A: generateId(tableName, id)
   *   A->>DB: get(_id)
   *   alt Success
   *     DB-->>A: record
   *     A->>A: assignMetadata(record, record._rev)
   *     A-->>A: return document with metadata
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   end
   */
  override async read(
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

  /**
   * @description Retrieves multiple documents from the database
   * @summary Fetches multiple documents from the Nano database by their IDs in a single operation
   * @param {string} tableName - The name of the table/collection
   * @param {Array<string | number | bigint>} ids - Array of document identifiers
   * @return A promise that resolves to an array of retrieved documents with metadata
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Database
   *   A->>A: Map ids to generateId(tableName, id)
   *   A->>DB: fetch({keys: mappedIds}, {})
   *   DB-->>A: results
   *   A->>A: Process each result row
   *   loop For each row
   *     alt Row has error
   *       A-->>A: throw InternalError
   *     else Row has document
   *       A->>A: assignMetadata(doc, doc._rev)
   *     else No document
   *       A-->>A: throw InternalError
   *     end
   *   end
   *   A-->>A: return documents with metadata
   */
  override async readAll(
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

  /**
   * @description Updates a document in the database
   * @summary Updates an existing document in the Nano database with the provided data
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The document identifier
   * @param {Record<string, any>} model - The updated document data
   * @return {Promise<Record<string, any>>} A promise that resolves to the updated document with metadata
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Database
   *   A->>DB: insert(model)
   *   alt Success
   *     DB-->>A: response with ok=true
   *     A->>A: assignMetadata(model, response.rev)
   *     A-->>A: return document with metadata
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   else Not OK
   *     DB-->>A: response with ok=false
   *     A-->>A: throw InternalError
   *   end
   */
  override async update(
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

  override async updateAll(
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

  override async delete(
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

  override async deleteAll(
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

  override async raw<R>(rawInput: MangoQuery, docsOnly = true): Promise<R> {
    try {
      const response: MangoResponse<R> = await this.native.find(rawInput);
      if (response.warning) console.warn(response.warning);
      if (docsOnly) return response.docs as R;
      return response as R;
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

  /**
   * @description Creates a new database on the Nano server
   * @summary Creates a new database with the specified name on the connected Nano server
   * @param {ServerScope} con - The Nano server connection
   * @param {string} name - The name of the database to create
   * @return {Promise<void>} A promise that resolves when the database is created
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Server
   *   A->>DB: db.create(name)
   *   alt Success
   *     DB-->>A: result with ok=true
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   else Not OK
   *     DB-->>A: result with ok=false
   *     A-->>A: throw parseError(error, reason)
   *   end
   */
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

  /**
   * @description Deletes a database from the Nano server
   * @summary Removes an existing database with the specified name from the connected Nano server
   * @param {ServerScope} con - The Nano server connection
   * @param {string} name - The name of the database to delete
   * @return {Promise<void>} A promise that resolves when the database is deleted
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant DB as Nano Server
   *   A->>DB: db.destroy(name)
   *   alt Success
   *     DB-->>A: result with ok=true
   *   else Error
   *     DB-->>A: error
   *     A-->>A: throw parseError(e)
   *   else Not OK
   *     DB-->>A: result with ok=false
   *     A-->>A: throw InternalError
   *   end
   */
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

  /**
   * @description Creates a new user and grants access to a database
   * @summary Creates a new user in the Nano server and configures security to grant the user access to a specific database
   * @param {ServerScope} con - The Nano server connection
   * @param {string} dbName - The name of the database to grant access to
   * @param {string} user - The username to create
   * @param {string} pass - The password for the new user
   * @param {string[]} [roles=["reader", "writer"]] - The roles to assign to the user
   * @return {Promise<void>} A promise that resolves when the user is created and granted access
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant U as _users Database
   *   participant S as Security API
   *   A->>A: Create user object
   *   A->>U: insert(user)
   *   alt Success
   *     U-->>A: response with ok=true
   *     A->>S: PUT _security with user permissions
   *     alt Security Success
   *       S-->>A: security response with ok=true
   *     else Security Failure
   *       S-->>A: security response with ok=false
   *       A-->>A: throw InternalError
   *     end
   *   else Error
   *     U-->>A: error
   *     A-->>A: throw parseError(e)
   *   else Not OK
   *     U-->>A: response with ok=false
   *     A-->>A: throw InternalError
   *   end
   */
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

  /**
   * @description Deletes a user from the Nano server
   * @summary Removes an existing user from the Nano server
   * @param {ServerScope} con - The Nano server connection
   * @param {string} dbName - The name of the database (used for logging purposes)
   * @param {string} user - The username to delete
   * @return {Promise<void>} A promise that resolves when the user is deleted
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant U as _users Database
   *   A->>A: Generate user ID
   *   A->>U: get(id)
   *   U-->>A: user document
   *   A->>U: destroy(id, user._rev)
   *   alt Success
   *     U-->>A: success response
   *   else Error
   *     U-->>A: error
   *     A-->>A: throw parseError(e)
   *   end
   */
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

  /**
   * @description Sets up decorations for Nano-specific model properties
   * @summary Configures decorators for created_by and updated_by fields in models to be automatically
   * populated with the user from the context when documents are created or updated
   * @return {void}
   * @mermaid
   * sequenceDiagram
   *   participant A as NanoAdapter
   *   participant D as Decoration
   *   participant R as Repository
   *   A->>R: key(PersistenceKeys.CREATED_BY)
   *   R-->>A: createdByKey
   *   A->>D: flavouredAs("nano")
   *   A->>D: for(createdByKey)
   *   A->>D: define(onCreate(createdByOnNanoCreateUpdate), propMetadata)
   *   A->>D: apply()
   *   A->>R: key(PersistenceKeys.UPDATED_BY)
   *   R-->>A: updatedByKey
   *   A->>D: flavouredAs("nano")
   *   A->>D: for(updatedByKey)
   *   A->>D: define(onCreate(createdByOnNanoCreateUpdate), propMetadata)
   *   A->>D: apply()
   */
  static override decoration() {
    super.decoration();
    const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
    const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);
    Decoration.flavouredAs("nano")
      .for(createdByKey)
      .define(
        onCreate(createdByOnNanoCreateUpdate),
        propMetadata(createdByKey, {})
      )
      .apply();

    Decoration.flavouredAs("nano")
      .for(updatedByKey)
      .define(
        onCreate(createdByOnNanoCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();
  }
}

Adapter.setCurrent(NanoFlavour);
