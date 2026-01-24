import { Constructor } from "@decaf-ts/decoration";
import { Repository } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { NanoRepository } from "../../src";

export function nanoRepository<M extends Model>(model: Constructor<M>) {
  return Repository.forModel(model) as NanoRepository<M>;
}
