import { NanoAdapter } from "./adapter";

// Forces override for Nano Decoration
NanoAdapter.decoration();

export * from "./constants";
export * from "./NanoRepository";
export * from "./types";
// Left to the end on purpose
export * from "./adapter";

/**
 * @description A TypeScript module for interacting with Nano databases
 * @summary This module provides a set of utilities, classes, and types for working with Nano databases. It includes repository patterns, adapters, and type definitions to simplify database operations.
 * @module for-nano
 */

/**
 * @description Package version identifier
 * @summary Stores the current package version string for the for-nano module
 * @const VERSION
 * @memberOf module:for-nano
 */
export const VERSION = "##VERSION##";
