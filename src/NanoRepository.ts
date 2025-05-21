import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Adapter, Repository } from "@decaf-ts/core";
import { DocumentScope } from "nano";
import { NanoFlags } from "./types";
import { Context } from "@decaf-ts/db-decorators";

export type NanoRepository<M extends Model> = Repository<
  M,
  MangoQuery,
  Adapter<DocumentScope<any>, MangoQuery, NanoFlags, Context<NanoFlags>>
>;
