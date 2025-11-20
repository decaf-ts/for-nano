import {
  maxlength,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { BaseModel, createdBy } from "@decaf-ts/core";
import { column, table, unique } from "@decaf-ts/core";
import { pk } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { NanoFlavour } from "../src/index";

@uses(NanoFlavour)
@table("tst_user")
@model()
export class TestModel extends BaseModel {
  @pk()
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  @column("tst_created_by")
  @createdBy()
  createdBy!: string;

  @column("tst_updated_by")
  @createdBy()
  updatedBy!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
