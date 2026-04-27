### How to Use

This guide shows practical, non-duplicated examples for all public APIs in @decaf-ts/for-nano using the repository pattern. The adapter class is not meant to be accessed directly; instead, always obtain a repository with Repository.forModel(Model).

Prerequisites:
- CouchDB server reachable from your app.
- Install the package: npm i @decaf-ts/for-nano @decaf-ts/for-couchdb @decaf-ts/core @decaf-ts/db-decorators @decaf-ts/decorator-validation nano
- Importing from @decaf-ts/for-nano registers the Nano backend with the core Repository system.

---

0) Define a model and get a repository

Description: Declare a model with table/primary-key decorators and get a Nano-powered repository for it. The flavour is auto-wired by importing @decaf-ts/for-nano.

```ts
import {
  BaseModel,
  Repository,
  pk,
  uses,
} from "@decaf-ts/core";
import { model, Model, ModelArg, required } from "@decaf-ts/decorator-validation";
import type { NanoRepository } from "@decaf-ts/for-nano";

@uses("nano")
@model()
class UserModel extends BaseModel implements Model {
  @pk({ type: "String" })
  id!: string; // primary key

  @required()
  name!: string;

  constructor(arg?: ModelArg<UserModel>) {
    super(arg);
  }
}

const repo: NanoRepository<UserModel> = Repository.forModel<UserModel, NanoRepository<UserModel>>(UserModel);
```

1) Flags with user context

Description: Pass NanoFlags in repository calls; the user info is propagated to operations by the adapter under the hood.

```ts
import type { NanoFlags } from "@decaf-ts/for-nano";

const flags: NanoFlags = {
  user: { name: "tester", roles: ["writer"] },
};
```

2) CRUD: create and read a single document

Description: Insert a document and read it back. CouchDB revisions are stored in PersistenceKeys.METADATA transparently.

```ts
import { PersistenceKeys } from "@decaf-ts/core";

const created = await repo.create(new UserModel({ id: "user:1", name: "Ada" }));
// created[PersistenceKeys.METADATA] contains the new revision string, e.g., "1-a"

const loaded = await repo.read("user:1");
console.log(loaded.name);
```

3) Bulk create and bulk read

Description: Insert multiple documents and then fetch them by IDs. Bulk operations aggregate errors.

```ts
const users = [
  new UserModel({ id: "user:2", name: "Lin" }),
  new UserModel({ id: "user:3", name: "Grace" }),
];
const createdMany = await repo.createAll(users);

const fetchedMany = await repo.readAll(["user:2", "user:3"]);
```

4) Update and updateAll

Description: Update requires the previous revision in metadata. The new revision is written back into metadata.

```ts
let u = await repo.read("user:1");
// ... mutate
u.name = "Ada Lovelace";
// u already has PersistenceKeys.METADATA from read()
u = await repo.update(u);

// Bulk update requires each model to carry its matching metadata
const u2 = await repo.read("user:2");
const u3 = await repo.read("user:3");
const updatedMany = await repo.updateAll([u2, u3]);
```

5) Delete and deleteAll

Description: Delete a single document, or delete in bulk by IDs.

```ts
const deleted = await repo.delete("user:3");

const deletedMany = await repo.deleteAll(["user:1", "user:2"]);
```

6) Query with selectors (instead of raw Mango)

Description: Use the Repository query API to filter and project results.

```ts
import { Condition, OrderDirection } from "@decaf-ts/core";

// Select all as full UserModel objects
const all = await repo.select().execute();

// Select only specific attributes
const projected = await repo.select(["name"]).execute();

// Conditional queries
const nameEq = Condition.attribute<UserModel>("name").eq("Ada Lovelace");
const named = await repo.select().where(nameEq).execute();

// Ordering (requires proper indexes configured for CouchDB)
const ordered = await repo.select().orderBy(["name", OrderDirection.ASC]).execute();
```

7) Observe changes via repository

Description: Subscribe to CREATE/UPDATE/DELETE events using the Observer interface. The repository wires Nano’s change feed internally.

```ts
import type { Observer } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";

const observer: Observer = {
  async refresh(table: string, operation: OperationKeys | string, ids: string[]) {
    if (operation.toString() === OperationKeys.DELETE.toString()) {
      console.log(`Deleted from ${table}:`, ids);
    }
  },
};

await repo.observe(observer);
// ... later
await repo.unObserve(observer);
```

8) Choose the backend via NanoFlavour

Description: Use NanoFlavour as an identifier in multi-backend setups.

```ts
import { NanoFlavour } from "@decaf-ts/for-nano";
console.log(NanoFlavour); // "nano"
```

9) Use NanoRepository typing

Description: Bind your model type to a repository powered by the Nano backend.

```ts
import type { NanoRepository } from "@decaf-ts/for-nano";
import type { Model } from "@decaf-ts/decorator-validation";

class MyModel implements Model {
  _id!: string;
}

let myRepo!: NanoRepository<MyModel>;
```

10) Access package VERSION

Description: Read the module’s version string if you need it for diagnostics.

```ts
import { VERSION } from "@decaf-ts/for-nano";
console.log("for-nano version:", VERSION);
```

Advanced (optional): Administration helpers

Description: If you must manage CouchDB resources, @decaf-ts/for-nano exports static helpers on NanoAdapter (no direct instantiation required). These are not part of the Repository API.

```ts
import { NanoAdapter } from "@decaf-ts/for-nano";

// Build a Nano (CouchDB) connection
const url = NanoAdapter.connect("admin", "secret", "localhost:5984", "http");

// Ensure a database exists / manage users
await NanoAdapter.createDatabase(url, "mydb");
// ... createUser/deleteUser, deleteDatabase, etc.
```

## Task Engine guardrails for migration orchestration

Migration command runners and the integration tests rely on a dedicated `RamAdapter` task engine that never shares an alias with the adapters being migrated. `MigrationService.migrateAdapters` enforces this guardrail by comparing every adapter alias and rejecting runs where the task engine would also be a migration target. Keep your task engine adapter isolated (for example `new RamAdapter({}, "decaf-cli-task-engine")`) and set `concurrency: 1` so version steps stay sequential.

```ts
import { RamAdapter } from "@decaf-ts/core/ram";
import { TaskService } from "@decaf-ts/core/tasks";

const taskEngineAdapter = new RamAdapter({}, "decaf-cli-task-engine");
const taskService = new TaskService();
await taskService.boot({
  adapter: taskEngineAdapter,
  workerId: "nano-migration-worker",
  leaseMs: 10_000,
  logTailMax: 250,
});
```

Reserve `leaseMs` for longer-running migrations, tune `pollMsBusy`/`pollMsIdle`, and attach a `TaskEventBus` if you want progress logs in the CLI output. `taskService.track(taskId)` can then stream the same progress/log events that the integration tests already observe.

## Migration lifecycle and @migration semantics for Nano

`@migration` metadata controls ordering and flavour targeting:

```ts
@migration("1.1.0-add-category-field", {
  precedence: "1.1.0",
  flavour: "nano",
  rules: [
    async (_, adapter) => Boolean(await adapter.exists("for_nano_migration_products")),
  ],
})
class AddCategoryMigration extends AbsMigration<NanoAdapter> { ... }
```

- `reference`: the canonical label (usually the semver string) used for logging, precedence tokens, and version normalization.
- `precedence`: a constructor, reference string, or object pointing to another migration to force ordering when version/flavour collide.
- `flavour`: limits execution to the Nano flavour (the for-nano tests only execute Nano-scoped migrations).
- `rules`: async predicates `(qr, adapter, ctx)` that gate execution; a `false` result skips the migration without failing the run.

`MigrationService` also expects handlers for `retrieveLastVersion` and `setCurrentVersion`. These functions are invoked per flavour so you can persist the head (e.g., in a `VersionRepo`). During the live integration test we initialize the version map at `"1.0.0"` and let `setCurrentVersion` advance it to the target version once the required property addition/backfill completes.

Use `MigrationService.migrateAdapters([nanoAdapter], { toVersion: "2.0.0", handlers: {...}, taskMode: true, taskService })` once your `NanoAdapter` is initialized. `taskMode: true` queues one `CompositeTask` per version and calls `setCurrentVersion` immediately after each task resolves, which keeps the persistent version marker aligned with the latest fully applied hop. Normal mode updates the version only after the whole batch finishes.

`MigrationService.retry(taskId)` rewrites the failed `TaskModel` to `PENDING`, clears `error`, `leaseOwner`, and timestamps, and re-enqueues the same version so the CLI can resume from the failing point. Because the version marker wasn't advanced for the failed task, rerunning the CLI with the same `toVersion` continues at the correct semantic boundary. Our tests ensure that every migration adds a required property/column and fills existing documents with the default value before the next version runs.




## Live migration workflow

Migration integration suites run against live CouchDB instances. `for-nano` tests are intentionally limited to `RamAdapter` + `NanoAdapter` so they stay independent of SQL modules. That means:

- Every migration must add a new required property/column and backfill every existing document with the default value before continuing.
- Use `MigrationService.migrateAdapters([nanoAdapter], config)` with flavour-scoped handlers so the last executed version is persisted independently per adapter.
- If you turn on `taskMode`, boot a separate `RamAdapter` (alias distinct from the ones being migrated) before you create the `TaskService`. The migration guard throws if the task engine adapter alias is also a migration target.

```ts
@migration("1.1.0-add-isActive", {
  precedence: "1.1.0",
  flavour: "nano",
})
export class AddIsActiveMigration implements Migration<any, NanoAdapter> {
  async up(_, adapter) {
    const repo = new Repository(adapter, UserModel);
    const users = await repo.select().execute();
    await Promise.all(
      users.map((user) => repo.update({ ...user, isActive: true }))
    );
  }
}
```

```ts
const migrations = await MigrationService.migrateAdapters(
  [nanoAdapter],
  {
    toVersion: "1.1.0",
    flavours: ["nano"],
    taskMode: true,
    taskService,
    handlers: {
      nano: {
        retrieveLastVersion: async (adapter) =>
          (await versionRepo(adapter).read("nano"))?.version,
        setCurrentVersion: async (version, adapter) =>
          await versionRepo(adapter).upsert("nano", { version }),
      },
    },
  }
);
for (const migration of migrations) {
  await migration.track();
}
```

`MigrationService` starts by calling the flavour-specific `retrieveLastVersion` handler so it knows which version the database already holds, then filters decorated migrations whose normalized versions are strictly greater than `currentVersion` and less than or equal to `toVersion`. `setCurrentVersion` is invoked after every successfully completed version: inline runs update once at the very end, while task mode updates immediately after each tracked `CompositeTask`. This guarantees the recorded `currentVersion` always equals the last fully finished hop, so rerunning the command will skip completed versions and replay only the pending ones. When a task fails, call `MigrationService.retry(taskId)` (optionally `taskService.track(id)` to observe progress) to reset the `TaskModel` to `PENDING`, clear its error/lease metadata, and let the TaskEngine reclaim the same version without revisiting already finished steps.

The `@migration` decorator handles ordering and targeting. The key arguments are:

- `reference`: the name/semver label used in logs and dependency graphs.
- `precedence`: optional hint (a constructor, string, or object) that the sorter uses when two migrations share the same version and flavour.
- `flavour`: restricts the migration to one adapter flavour (`"nano"`, `"type-orm"`, etc.). Omit it for generic migrations or to let `includeGenericInTaskMode` decide when to run.
- `rules`: async predicates that gate execution (`(qr, adapter, ctx) => Promise<boolean>`). When a rule returns `false` the migration is skipped without error.

The CLI migrations guard enforces that the `TaskEngine` runs on a separate `RamAdapter` alias that is never one of the migrating adapters, keeping persistence targets isolated and preventing lease conflicts.

Use `MigrationRule`s (the `rules` array in `@migration`) to gate execution based on adapter state. Keep every migration focused on one version jump so the live suites can always rerun and verify the required schema change and backfill.

## Coding Principles

- group similar functionality in folders (analog to namespaces but without any namespace declaration)
- one class per file;
- one interface per file (unless interface is just used as a type);
- group types as other interfaces in a types.ts file per folder;
- group constants or enums in a constants.ts file per folder;
- group decorators in a decorators.ts file per folder;
- always import from the specific file, never from a folder or index file (exceptions for dependencies on other packages);
- prefer the usage of established design patters where applicable:
  - Singleton (can be an anti-pattern. use with care);
  - factory;
  - observer;
  - strategy;
  - builder;
  - etc;

## Release Documentation Hooks
Stay aligned with the automated release pipeline by reviewing [Release Notes](./workdocs/reports/RELEASE_NOTES.md) and [Dependencies](./workdocs/reports/DEPENDENCIES.md) after trying these recipes (updated on 2025-11-26).
