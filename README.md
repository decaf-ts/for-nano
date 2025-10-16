![Banner](./workdocs/assets/Banner.png)

# Decaf's Nano (CouchDB) Module

A lightweight adapter layer and utilities to use CouchDB via the Nano client within the decaf-ts ecosystem. It provides a NanoAdapter with repository-friendly CRUD, bulk operations, indexing, user/database management helpers, and a change feed dispatcher, plus typed flags and configuration for ergonomic, testable data access.

![Licence](https://img.shields.io/github/license/decaf-ts/for-nano.svg?style=plastic)
![GitHub language count](https://img.shields.io/github/languages/count/decaf-ts/for-nano?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/decaf-ts/for-nano?style=plastic)

[![Build & Test](https://github.com/decaf-ts/for-nano/actions/workflows/nodejs-build-prod.yaml/badge.svg)](https://github.com/decaf-ts/for-nano/actions/workflows/nodejs-build-prod.yaml)
[![CodeQL](https://github.com/decaf-ts/for-nano/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/decaf-ts/for-nano/actions/workflows/codeql-analysis.yml)[![Snyk Analysis](https://github.com/decaf-ts/for-nano/actions/workflows/snyk-analysis.yaml/badge.svg)](https://github.com/decaf-ts/for-nano/actions/workflows/snyk-analysis.yaml)
[![Pages builder](https://github.com/decaf-ts/for-nano/actions/workflows/pages.yaml/badge.svg)](https://github.com/decaf-ts/for-nano/actions/workflows/pages.yaml)
[![.github/workflows/release-on-tag.yaml](https://github.com/decaf-ts/for-nano/actions/workflows/release-on-tag.yaml/badge.svg?event=release)](https://github.com/decaf-ts/for-nano/actions/workflows/release-on-tag.yaml)

![Open Issues](https://img.shields.io/github/issues/decaf-ts/for-nano.svg)
![Closed Issues](https://img.shields.io/github/issues-closed/decaf-ts/for-nano.svg)
![Pull Requests](https://img.shields.io/github/issues-pr-closed/decaf-ts/for-nano.svg)
![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

![Forks](https://img.shields.io/github/forks/decaf-ts/for-nano.svg)
![Stars](https://img.shields.io/github/stars/decaf-ts/for-nano.svg)
![Watchers](https://img.shields.io/github/watchers/decaf-ts/for-nano.svg)

![Node Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=Node&query=$.engines.node&colorB=blue)
![NPM Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=NPM&query=$.engines.npm&colorB=purple)

Documentation available [here](https://decaf-ts.github.io/for-nano/)

### Description

This package integrates CouchDB via the Nano client into the decaf-ts data stack. It exposes a focused set of primitives that make CouchDB usage consistent with other decaf-ts backends (TypeORM, HTTP, Pouch, etc.), while retaining Nano’s flexibility.

Core elements and their intents:

- NanoAdapter
  - Bridges decaf-ts Repository operations with Nano’s DocumentScope API.
  - Implements repository-friendly CRUD: create, read, update, delete, plus bulk variants (createAll, readAll, updateAll, deleteAll).
  - Preserves and manages CouchDB revision metadata transparently via PersistenceKeys.METADATA and CouchDBKeys.REV.
  - Provides raw Mango query capability (raw) and index management (index).
  - Offers connection and administration helpers: connect, createDatabase, deleteDatabase, createUser, deleteUser.
  - Exposes Dispatch() to construct a NanoDispatch for change feed observation.
  - Normalizes operation flags via flags(), ensuring user context is propagated from NanoFlags to the underlying operations.

- NanoDispatch
  - A Dispatch implementation that subscribes to CouchDB’s continuous changes feed through Nano.
  - Parses change feed frames, groups them by table and operation (CREATE/UPDATE/DELETE), and notifies observers through updateObservers.
  - Handles reconnection attempts and keeps track of the last processed update step (observerLastUpdate) for resilience.

- NanoRepository
  - A typed alias that binds Repository to the Nano-specific types: MangoQuery, NanoAdapter, NanoFlags, and Context.
  - Enables consumers to use a familiar Repository API with CouchDB when paired with NanoAdapter.

- Types and constants
  - NanoFlags extends RepositoryFlags with a required user object (name, roles?) for consistent auth context propagation.
  - NanoConfig captures the minimal connection shape (user, password, host, dbName) for setting up adapters.
  - NanoFlavour identifies this backend for selection in multi-backend setups.
  - VERSION exposes the package version string.

Design considerations:

- Predictable metadata management: CouchDB’s _rev is captured in internal metadata, avoiding accidental leakage into domain models.
- Bulk operations are error-aware: mixed success/failure responses are aggregated and surfaced as InternalError, preserving the failing reasons from Nano.
- Testability: All core behaviors (CRUD, bulk, raw, admin helpers, dispatch) are covered by unit tests and written to be easily mocked.
- Interop-first: Reuses shared types from @decaf-ts/for-couchdb (e.g., MangoQuery, CouchDBKeys) so that query building and index generation are consistent across CouchDB-based adapters.



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




### Related

[![decaf-ts](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decaf-ts)](https://github.com/decaf-ts/decaf-ts)
[![for pouch](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=for-pouch)](https://github.com/decaf-ts/for-pouch)
[![core](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=core)](https://github.com/decaf-ts/core)
[![decorator-validation](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decorator-validation)](https://github.com/decaf-ts/decorator-validation)
[![db-decorators](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=db-decorators)](https://github.com/decaf-ts/db-decorators)


### Social

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/decaf-ts/)




#### Languages

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ShellScript](https://img.shields.io/badge/Shell_Script-121011?style=for-the-badge&logo=gnu-bash&logoColor=white)

## Getting help

If you have bug reports, questions or suggestions please [create a new issue](https://github.com/decaf-ts/ts-workspace/issues/new/choose).

## Contributing

I am grateful for any contributions made to this project. Please read [this](./workdocs/98-Contributing.md) to get started.

## Supporting

The first and easiest way you can support it is by [Contributing](./workdocs/98-Contributing.md). Even just finding a typo in the documentation is important.

Financial support is always welcome and helps keep both me and the project alive and healthy.

So if you can, if this project in any way. either by learning something or simply by helping you save precious time, please consider donating.

## License

This project is released under the [MIT License](./LICENSE.md).

By developers, for developers...
