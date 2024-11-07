import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { NanoAdapter } from "./adapter";
import { Repository } from "@decaf-ts/core";

export interface NanoRepository<M extends Model>
  extends Repository<M, MangoQuery> {
  adapter: NanoAdapter;
}