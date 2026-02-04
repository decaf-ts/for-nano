/* eslint-disable @typescript-eslint/no-unused-vars */
import { NanoAdapter } from "../../src";
console.log(NanoAdapter.name);
import { Repo, Repository } from "@decaf-ts/core";
import { Logging, LogLevel } from "@decaf-ts/logging";

import { generateGtin } from "./gtin";
import { Product } from "./Product";
import { setupNanoAdapter } from "../helpers/nanoSetup";

Logging.setConfig({ level: LogLevel.debug });

const Clazz = Product;

describe("e2e Repository test", () => {
  let created: Product;
  let adapter: NanoAdapter;
  let repo: Repo<Product>;

  beforeAll(async () => {
    const setup = await setupNanoAdapter("repository");
    adapter = setup.adapter;
    repo = Repository.forModel(Clazz);
  });

  it("creates", async () => {
    const id = generateGtin();
    const model = new Product({
      productCode: id,
      inventedName: "test_name",
      nameMedicinalProduct: "123456789",
      strengths: [
        {
          productCode: id,
          strength: "200mg",
          substance: "Ibuprofen",
        },
        {
          productCode: id,
          strength: "400mg",
          substance: "Ibuprofen",
        },
      ],
      markets: [
        {
          productCode: id,
          marketId: "BR",
          nationalCode: "BR",
          mahName: "ProPharma BR",
        },
        {
          productCode: id,
          marketId: "US",
          nationalCode: "US",
          mahName: "ProPharma US",
        },
      ],
    });

    created = await repo.create(model);
    expect(created).toBeDefined();
    expect(created.strengths.length).toEqual(model.strengths.length);
    expect(created.markets.length).toEqual(model.markets.length);
  });
});
