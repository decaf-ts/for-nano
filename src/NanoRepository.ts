import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { NanoAdapter } from "./adapter";

/**
 * @description Type for Nano database repositories
 * @summary A specialized repository type for working with Nano databases, extending the base Repository
 * with Nano-specific adapter, flags, and context types
 * @template M - Type extending Model that this repository will manage
 * @typedef {Repository<M, MangoQuery, NanoAdapter, NanoFlags, Context<NanoFlags>>} NanoRepository
 * @memberOf module:for-nano
 */
export type NanoRepository<M extends Model> = Repository<M, NanoAdapter>;
