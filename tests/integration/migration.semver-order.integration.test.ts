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

describe("for-nano migration semver ordering", () => {
  it("keeps deterministic semver upgrade sequence", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();

    const sorted = (service as any)
      .sort([
        resolved("2.0.0", "2.0.0"),
        resolved("1.10.0", "1.10.0"),
        resolved("1.2.0", "1.2.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["1.2.0", "1.10.0", "2.0.0"]);
  });
});
