import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Repository } from "@decaf-ts/core";
import { NanoAdapter } from "./adapter";
import { NanoFlags } from "./types";
import { Context } from "@decaf-ts/db-decorators";

export type NanoRepository<M extends Model> = Repository<
  M,
  MangoQuery,
  NanoAdapter,
  NanoFlags,
  Context<NanoFlags>
>;
