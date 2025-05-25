import { Dispatch } from "@decaf-ts/core";
import {
  DatabaseChangesResponse,
  DatabaseChangesResultItem,
  DocumentScope,
  RequestError,
} from "nano";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

export class NanoDispatch extends Dispatch<DocumentScope<any>> {
  private observerLastUpdate?: string;
  private attemptCounter: number = 0;
  constructor(private timeout = 5000) {
    super();
  }

  protected async changeHandler(
    error: RequestError | null,
    response: (DatabaseChangesResponse | DatabaseChangesResultItem)[] | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    headers?: any
  ) {
    const log = this.log.for(this.changeHandler);
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
            await this.updateObservers(table, op, [
              ...changes[table][op].ids.values(),
            ]);
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

  protected override initialize(): void {
    async function subscribeToCouch(this: NanoDispatch): Promise<void> {
      const log = this.log.for(subscribeToCouch);
      if (!this.adapter || !this.native)
        throw new InternalError(`No adapter/native observed for dispatch`);

      try {
        this.native.changes(
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
          return log.error(`Failed to subscribe to couchdb changes: ${e}`);
        log.info(
          `Failed to subscribe to couchdb changes: ${e}. Retrying in 5 seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, this.timeout));
        return subscribeToCouch.call(this);
      }
    }

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
