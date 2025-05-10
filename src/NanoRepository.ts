import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Context, Repository } from "@decaf-ts/core";
import { RepositoryFlags } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "./adapter";

export type NanoRepository<M extends Model> = Repository<
  M,
  Context<RepositoryFlags>,
  RepositoryFlags,
  MangoQuery,
  NanoAdapter
>;
