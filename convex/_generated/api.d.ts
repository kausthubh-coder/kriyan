/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as calendar from "../calendar.js";
import type * as commands from "../commands.js";
import type * as dev from "../dev.js";
import type * as installations from "../installations.js";
import type * as knowledge from "../knowledge.js";
import type * as lib from "../lib.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as projections from "../projections.js";
import type * as read from "../read.js";
import type * as validators from "../validators.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  calendar: typeof calendar;
  commands: typeof commands;
  dev: typeof dev;
  installations: typeof installations;
  knowledge: typeof knowledge;
  lib: typeof lib;
  notes: typeof notes;
  notifications: typeof notifications;
  projections: typeof projections;
  read: typeof read;
  validators: typeof validators;
  worker: typeof worker;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
