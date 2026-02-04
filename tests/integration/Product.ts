import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  Cascade,
  column,
  index,
  oneToMany,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { ProductStrength } from "./ProductStrength";
import { Market } from "./Market";

import { BaseIdentifiedModel } from "./BaseIdentifiedModel";

@uses("nano")
@table()
@model()
export class Product extends BaseIdentifiedModel {
  @pk()
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  inventedName!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  nameMedicinalProduct!: string;

  @column()
  internalMaterialCode?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  productRecall: boolean = false;

  @column()
  counter?: number;

  @column()
  launchDate?: Date;

  @oneToMany(
    () => ProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  strengths!: ProductStrength[];

  @oneToMany(
    () => Market,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  markets!: Market[];

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
