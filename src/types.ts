import { RepositoryFlags } from "@decaf-ts/db-decorators";

/**
 * @description Configuration flags for Nano database operations
 * @summary Extended repository flags that include user authentication information for Nano database connections
 * @interface NanoFlags
 * @memberOf module:for-nano
 */
export interface NanoFlags extends RepositoryFlags {
  /**
   * @description User authentication information for Nano database connections
   */
  user: {
    /**
     * @description Username for authentication with the Nano database
     */
    name: string;
    /**
     * @description Optional array of roles assigned to the user
     */
    roles?: string[];
  };
}

/**
 * @description Connection configuration for Nano
 * @summary Defines the necessary parameters to establish a connection to a Nano (CouchDB) server and select a database
 * @property {string} user - Username to authenticate against the server
 * @property {string} password - Password to authenticate the user
 * @property {string} host - Host and port of the server (e.g., "localhost:5984") or full URL host without protocol
 * @property {string} dbName - The database name to use on the server
 * @typeDef NanoConfig
 * @memberOf module:for-nano
 */
export type NanoConfig = {
  user: string;
  password: string;
  host: string;
  dbName: string;
};
