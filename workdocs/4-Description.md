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

