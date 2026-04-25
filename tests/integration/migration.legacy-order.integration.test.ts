import {
  MigrationService,
} from "@decaf-ts/core/migrations";
import { SemverMigrationVersioning } from "../../../core/src/migrations/SemverMigrationVersioning";

function resolved(reference: string, version: string) {
  return {
    reference,
    version,
    flavour: "nano",
    migration: {
      reference,
      precedence: null,
      flavour: "nano",
      transaction: true,
      async up() {
        return;
      },
      async migrate() {
        return;
      },
      async down() {
        return;
      },
    },
  };
}

describe("for-nano migration legacy strategy", () => {
  it("defaults to legacy lexical ordering", () => {
    const service = new MigrationService<any>();
    const sorted = (service as any)
      .sort([
        resolved("1.10.0", "1.10.0"),
        resolved("1.2.0", "1.2.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["1.10.0", "1.2.0"]);
  });

  it("supports semver ordering when strategy is injected", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const sorted = (service as any)
      .sort([
        resolved("1.10.0", "1.10.0"),
        resolved("1.2.0", "1.2.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["1.2.0", "1.10.0"]);
  });
});
