/**
 * Compatibility re-export of the Loader entry.
 *
 * The Loader row targets `./lib/entry.js` directly, so this file only keeps the
 * package's `main` and default export meaningful for anything that imports the
 * package by name.
 *
 * @module dsh-account-balance
 */

export * from './lib/entry.js';
