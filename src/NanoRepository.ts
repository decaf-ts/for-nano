import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Adapter, Repository } from "@decaf-ts/core";
import { DocumentScope } from "nano";

export type NanoRepository<M extends Model> = Repository<
  M,
  MangoQuery,
  Adapter<DocumentScope<any>, MangoQuery>
>;
