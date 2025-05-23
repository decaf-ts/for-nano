import { NanoAdapter } from "./adapter";

// Forces override for Nano Decoration
NanoAdapter.decoration();

export * from "./constants";
export * from "./NanoRepository";
export * from "./types";
// Left to the end on purpose
export * from "./adapter";

/**
 * @summary Module summary
 * @description Module description
 * @module for-nano
 */

/**
 * @summary stores the current package version
 * @description this is how you should document a constant
 * @const VERSION
 * @memberOf module:ts-workspace
 */
export const VERSION = "##VERSION##";
