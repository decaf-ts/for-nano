import { NanoAdapter } from "./adapter";
import { Metadata } from "@decaf-ts/decoration";

// Forces override for Nano Decoration
NanoAdapter.decoration();

export * from "./constants";
export * from "./NanoRepository";
export * from "./types";
// Left to the end on purpose
export * from "./adapter";

/**
 * @description A TypeScript module for interacting with Nano databases
 * @summary This module provides a set of utilities, classes, and types for working with Nano databases. It includes repository patterns, adapters, and type definitions to simplify database operations. Key exports include {@link NanoAdapter}, {@link NanoRepository}, {@link NanoFlags}, and {@link NanoFlavour}.
 * @module for-nano
 */

/**
 * @description Package version identifier
 * @summary Stores the current package version string for the for-nano module
 * @const VERSION
 * @memberOf module:for-nano
 */
export const VERSION = "##VERSION##";

/**
 * @description Represents the current commit hash of the module build.
 * @summary Stores the current git commit hash for the package. The build replaces
 * the placeholder with the actual commit hash at publish time.
 * @const COMMIT
 */
export const COMMIT = "##COMMIT##";

/**
 * @description Represents the full version string of the module.
 * @summary Stores the semver version and commit hash for the package.
 * The build replaces the placeholder with the actual `<version>-<commit>` value at publish time.
 * @const FULL_VERSION
 */
export const FULL_VERSION = "##FULL_VERSION##";


/**
 * @description Package version identifier
 * @summary Stores the current package version string for the for-nano module
 * @const PACKAGE_NAME
 * @memberOf module:for-nano
 */
export const PACKAGE_NAME = "##PACKAGE##";

Metadata.registerLibrary(PACKAGE_NAME, VERSION);
