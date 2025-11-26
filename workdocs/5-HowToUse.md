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
