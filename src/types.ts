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

export type NanoConfig = {
  user: string;
  password: string;
  host: string;
  dbName: string;
};
