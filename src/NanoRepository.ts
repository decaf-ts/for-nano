import { Model } from "@decaf-ts/decorator-validation";
import { CouchDBRepository } from "@decaf-ts/for-couchdb";
import { NanoAdapter } from "./adapter";
import { Constructor } from "@decaf-ts/decoration";
import { ContextOf, FlagsOf } from "@decaf-ts/core";

/**
 * @description Type for Nano database repositories
 * @summary A specialized repository type for working with Nano databases, extending the base Repository
 * with Nano-specific adapter, flags, and context types
 * @template M - Type extending Model that this repository will manage
 * @typedef {Repository<M, MangoQuery, NanoAdapter, NanoFlags, Context<NanoFlags>>} NanoRepository
 * @memberOf module:for-nano
 */
export class NanoRepository<M extends Model> extends CouchDBRepository<
  M,
  NanoAdapter
> {
  constructor(adapter: NanoAdapter, model: Constructor<M>) {
    super(adapter, model);
  }

  override override(flags: Partial<FlagsOf<ContextOf<NanoAdapter>>>) {
    return super.override(flags).for(flags as unknown as never);
  }
}
