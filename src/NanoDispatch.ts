import { Adapter, Dispatch } from "@decaf-ts/core";
import {
  DatabaseChangesResponse,
  DatabaseChangesResultItem,
  RequestError,
} from "nano";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { CouchDBAdapter, CouchDBKeys } from "@decaf-ts/for-couchdb";

/**
 * @description Dispatcher for Nano database change events
 * @summary Handles the subscription to and processing of database change events from a Nano database,
 * notifying observers when documents are created, updated, or deleted
 * @template DocumentScope - The Nano document scope type
 * @param {number} [timeout=5000] - Timeout in milliseconds for change feed requests
 * @class NanoDispatch
 * @example
 * ```typescript
 * // Create a dispatcher for a Nano database
 * const db = server.db.use('my_database');
 * const adapter = new NanoAdapter(db);
 * const dispatch = new NanoDispatch();
 *
 * // The dispatcher will automatically subscribe to changes
 * // and notify observers when documents change
 * ```
 * @mermaid
 * classDiagram
 *   class Dispatch {
 *     +initialize()
 *     +updateObservers()
 *   }
 *   class NanoDispatch {
 *     -observerLastUpdate?: string
 *     -attemptCounter: number
 *     -timeout: number
 *     +constructor(timeout)
 *     #changeHandler()
 *     #initialize()
 *   }
 *   Dispatch <|-- NanoDispatch
 */
export class NanoDispatch extends Dispatch<CouchDBAdapter<any, any, any>> {
  private observerLastUpdate?: string;
  private attemptCounter: number = 0;

  private active: boolean = false;

  constructor(private timeout = 5000) {
    super();
  }

  /**
   * @description Closes the dispatcher
   * @summary Stops the dispatcher and cleans up any active subscriptions or resources
   * @return {Promise<void>} A promise that resolves when the dispatcher has been closed
   */
  override close(): Promise<void> {
    return super.close();
  }

  /**
   * @description Processes database change events
   * @summary Handles the response from the Nano changes feed, processes the changes,
   * and notifies observers about document changes
   * @param {RequestError | null} error - Error object if the request failed
   * @param response - The changes response from Nano
   * @param {any} [headers] - Response headers (unused)
   * @return {Promise<void>} A promise that resolves when all changes have been processed
   * @mermaid
   * sequenceDiagram
   *   participant D as NanoDispatch
   *   participant L as Logger
   *   participant O as Observers
   *   Note over D: Receive changes from Nano
   *   alt Error in response
   *     D->>L: Log error
   *     D-->>D: Return early
   *   end
   *   alt Response is string
   *     D->>D: Parse JSON from string
   *   end
   *   D->>D: Process changes
   *   D->>D: Group changes by table and operation
   *   loop For each table
   *     loop For each operation
   *       D->>O: updateObservers(table, operation, ids)
   *       D->>D: Update observerLastUpdate
   *       D->>L: Log successful dispatch
   *     end
   *   end
   */
  protected async changeHandler(
    error: RequestError | null,
    response: (DatabaseChangesResponse | DatabaseChangesResultItem)[] | string,
    headers?: any
  ) {
    const { log, ctx } = Adapter.logCtx(
      [error, response, headers],
      this.changeHandler
    );
    if (error) return log.error(`Error in change request: ${error}`);
    try {
      response = (
        typeof response === "string"
          ? response
              .split("\n")
              .filter((r) => !!r)
              .map((r) => JSON.parse(r))
          : response
      ) as DatabaseChangesResponse[];
    } catch (e: unknown) {
      return log.error(`Error parsing couchdb change feed: ${e}`);
    }
    const count = response.length;
    if (count > 0) {
      log.debug(`Received ${count} changes. processing...`);
      const changes = response
        .map((rec, i) => {
          if (i === count - 1) {
            if (
              this.observerLastUpdate ===
              (rec as DatabaseChangesResponse).last_seq
            )
              log.error(
                `Invalid last update check: ${this.observerLastUpdate} !== ${(rec as DatabaseChangesResponse).last_seq}`
              );
            return;
          }
          const r = rec as DatabaseChangesResultItem;
          const [table, id] = r.id.split(CouchDBKeys.SEPARATOR);
          return {
            table: table,
            id: id,
            operation: r.deleted
              ? OperationKeys.DELETE
              : r.changes[r.changes.length - 1].rev.split("-")[0] === "1"
                ? OperationKeys.CREATE
                : OperationKeys.UPDATE,
            step: r.changes[r.changes.length - 1].rev,
          };
        })
        .reduce(
          (
            accum: Record<
              string,
              Record<
                string,
                {
                  ids: Set<any>;
                  step: string;
                }
              >
            >,
            r
          ) => {
            if (!r) return accum;
            const { table, id, operation, step } = r as {
              table: string;
              id: string;
              operation: OperationKeys;
              step: string;
            };
            if (!accum[table]) accum[table] = {};
            if (!accum[table][operation])
              accum[table][operation] = { ids: new Set(), step: step };
            accum[table][operation].ids.add(id);
            accum[table][operation].step = step;
            return accum;
          },
          {}
        );

      for (const table of Object.keys(changes)) {
        for (const op of Object.keys(changes[table])) {
          try {
            await this.updateObservers(
              table,
              op,
              [...changes[table][op].ids.values()],
              ctx
            );
            this.observerLastUpdate = changes[table][op].step;
            log.verbose(`Observer refresh dispatched by ${op} for ${table}`);
            log.debug(`pks: ${Array.from(changes[table][op].ids.values())}`);
          } catch (e: unknown) {
            log.error(
              `Failed to dispatch observer refresh for ${table}, op ${op}: ${e}`
            );
          }
        }
      }
    }
  }

  /**
   * @description Initializes the dispatcher and subscribes to database changes
   * @summary Sets up the continuous changes feed subscription to the Nano database
   * and handles reconnection attempts if the connection fails
   * @return {Promise<void>} A promise that resolves when the subscription is established
   * @mermaid
   * sequenceDiagram
   *   participant D as NanoDispatch
   *   participant S as subscribeToCouch
   *   participant DB as Nano Database
   *   participant L as Logger
   *   D->>S: Call subscribeToCouch
   *   S->>S: Check adapter and native
   *   alt No adapter or native
   *     S-->>S: throw InternalError
   *   end
   *   S->>DB: changes(options, changeHandler)
   *   alt Success
   *     DB-->>S: Subscription established
   *     S-->>D: Promise resolves
   *     D->>L: Log successful subscription
   *   else Error
   *     DB-->>S: Error
   *     S->>S: Increment attemptCounter
   *     alt attemptCounter > 3
   *       S->>L: Log error
   *       S-->>D: Promise rejects
   *     else attemptCounter <= 3
   *       S->>L: Log retry
   *       S->>S: Wait timeout
   *       S->>S: Recursive call to subscribeToCouch
   *     end
   *   end
   */
  protected override async initialize(): Promise<void> {
    const log = this.log.for(this.initialize);
    const subLog = log.for(subscribeToCouch);
    async function subscribeToCouch(this: NanoDispatch): Promise<void> {
      if (!this.adapter)
        throw new InternalError(`No adapter/native observed for dispatch`);
      if (this.active) return;
      try {
        (this.adapter as any).client.changes(
          {
            feed: "continuous",
            include_docs: false,
            since: this.observerLastUpdate || "now",
            timeout: this.timeout,
          },
          this.changeHandler.bind(this) as any
        );
      } catch (e: unknown) {
        if (++this.attemptCounter > 3)
          return subLog.error(`Failed to subscribe to couchdb changes: ${e}`);
        subLog.info(
          `Failed to subscribe to couchdb changes: ${e}. Retrying in 5 seconds...`
        );
        if (!this.active) return;
        await new Promise((resolve) => setTimeout(resolve, this.timeout));
        return subscribeToCouch.call(this);
      }
    }

    this.active = true;
    subscribeToCouch
      .call(this)
      .then(() => {
        this.log.info(`Subscribed to couchdb changes`);
      })
      .catch((e: unknown) => {
        throw new InternalError(`Failed to subscribe to couchdb changes: ${e}`);
      });
  }
}
