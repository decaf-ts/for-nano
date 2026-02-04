import { NanoAdapter, NanoFlavour } from "../../src/index";

const TEST_ROOT: "src" | "lib" | "dist" = (process.env.TEST_ROOT || "src") as
  | "src"
  | "lib"
  | "dist";

import { Adapter, Context, MaybeContextualArg } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Contextual } from "@decaf-ts/db-decorators";
import { Logger, Logging, style } from "@decaf-ts/logging";

export type DecafE2eConfig<A extends Adapter<any, any, any, any>> = {
  flavour: string;
  adapterClazz: Constructor<A>;
  adapterFactory: () => Promise<A>;
  logger: Logger;
  ctxFactoryMock: jest.SpyInstance;
  ctxEvaluator?: (c: Context<any>) => boolean | Promise<boolean>;
};
const logger = Logging.for("e2e");
const contextFactory = Context.args.bind(Context);
const ctxMock = jest
  .spyOn(Context, "args")
  .mockImplementation(
    async (
      operation: string,
      model: ModelConstructor<any>,
      args: any[],
      contextual?: Contextual<Context<any>>,
      overrides?: Partial<any>,
      ...argz: any[]
    ) => {
      logger
        .for(style("db-decorators context factor").yellow.bold)
        .info(
          `operation: ${operation}, ${model ? `name ${model.name}, ` : ""}args: ${JSON.stringify(args)}, contextual: ${contextual.toString()}, overrides: ${JSON.stringify(overrides)} and argz: ${JSON.stringify(argz)}`
        );
      const ctx = await contextFactory(
        operation,
        model,
        args,
        contextual,
        overrides,
        ...argz
      );
      if (E2eConfig.ctxEvaluator && !(await E2eConfig.ctxEvaluator(ctx)))
        throw new Error(
          `Context failed evaluation for operation: ${operation}, ${model ? `name ${model.name}, ` : ""}args: ${JSON.stringify(args, undefined, 2)}, contextual: ${contextual.toString()}, overrides: ${JSON.stringify(overrides, undefined, 2)}`
        );
      return ctx;
    }
  );

export const E2eConfig: DecafE2eConfig<NanoAdapter> = {
  flavour: NanoFlavour,
  adapterClazz: NanoAdapter,
  logger: logger,
  adapterFactory: async (conf?: any, ...initArgs: MaybeContextualArg<any>) => {
    const adapter = new E2eConfig.adapterClazz(conf || { user: "e2e-user" });
    await adapter.initialize(...(initArgs as []));
    return adapter;
  },
  ctxFactoryMock: ctxMock,
};
// export * from "../../src"
