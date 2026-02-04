/* eslint-disable @typescript-eslint/no-unused-vars */

import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";

import { Model } from "@decaf-ts/decorator-validation";
import {
  AllOperationKeys,
  ContextualArgs,
  EventIds,
  Observer,
  PersistenceKeys,
  Repo,
  Repository,
} from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { Logging, LogLevel, style } from "@decaf-ts/logging";

import { generateGtin } from "./gtin";
import { Market } from "./Market";
import { Product } from "./Product";
import { ProductStrength } from "./ProductStrength";
import { E2eConfig } from "./e2e.config";
import { RamRepository } from "@decaf-ts/core/ram";
import { NanoAdapter, NanoRepository } from "../../src";
import { createNanoTestResources } from "../helpers/nano";
import { CouchDBRepository } from "@decaf-ts/for-couchdb";
import { TestModel } from "../TestModel";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository test", () => {
  let created: Product;
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  // let adapter: NanoAdapter;
  let repo: Repo<Product>;
  let observer: Observer;
  let mock: jest.Func;

  let contextFactoryMock: jest.SpyInstance;
  let adapterContextFactory: any;
  let bulk: Product[];

  function MockCtxFactory(
    op: string,
    overrides: Partial<any>,
    model: Constructor,
    ...args: any[]
  ) {
    const log = logger
      .for(style("adapter context factory").green.bold)
      .for(expect.getState().currentTestName);
    try {
      log.info(
        `adapter context called with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
      );
    } catch (e: unknown) {
      log.warn(
        `adapter context called with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
      );
    }
    return adapterContextFactory(op, overrides, model, ...args);
  }

  beforeAll(async () => {
    adapter = await adapterFactory();
    // repo = Repository.forModel(Clazz);
    // resources = await createNanoTestResources("repository");
    // expect(resources.connection).toBeDefined();
    // adapter = new NanoAdapter({
    //   user: resources.user,
    //   password: resources.password,
    //   host: resources.host,
    //   dbName: resources.dbName,
    //   protocol: "http",
    // });
    // await adapter.initialize();
    repo = new CouchDBRepository(adapter as any, Product);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();

    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    // repo.observe(observer);

    // adapterContextFactory = adapter.context.bind(adapter);
    // contextFactoryMock = jest
    //   .spyOn(adapter, "context")
    //   .mockImplementation(MockCtxFactory)
    //   .mockImplementationOnce(
    //     (
    //       op: string,
    //       overrides: Partial<any>,
    //       model: Constructor,
    //       ...args: any[]
    //     ) => {
    //       const ctx = MockCtxFactory(
    //         op,
    //         Object.assign({}, overrides, {
    //           PERSISTENT_PROPERTY: true,
    //         }),
    //         model,
    //         ...args
    //       );
    //       return ctx;
    //     }
    //   );
  });

  // afterEach(() => {
  //   repo.unObserve(observer);
  // });

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
  });

  it("Creates in bulk", async () => {
    const models = new Array(10).fill(0).map(() => {
      const id = generateGtin();
      return new Product({
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
    });
    bulk = await repo.createAll(models);
    console.log(
      "product_strength count after create",
      adapter["client"].get("product_strength")?.size
    );
    expect(bulk).toBeDefined();
    expect(Array.isArray(bulk)).toEqual(true);
    expect(bulk.every((el) => el instanceof Product)).toEqual(true);
    expect(bulk.every((el) => !el.hasErrors())).toEqual(true);
  });
});
