import { RepositoryFlags } from "@decaf-ts/db-decorators";

export interface NanoFlags extends RepositoryFlags {
  user: {
    name: string;
    roles?: string[];
  };
}
