/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agent from "../agent.js";
import type * as assistant from "../assistant.js";
import type * as crons from "../crons.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as maintenance from "../maintenance.js";
import type * as model_activity from "../model/activity.js";
import type * as model_asks from "../model/asks.js";
import type * as model_focus from "../model/focus.js";
import type * as model_owner from "../model/owner.js";
import type * as model_profile from "../model/profile.js";
import type * as model_progress from "../model/progress.js";
import type * as model_reminders from "../model/reminders.js";
import type * as model_routines from "../model/routines.js";
import type * as model_search from "../model/search.js";
import type * as model_spaces from "../model/spaces.js";
import type * as model_tasks from "../model/tasks.js";
import type * as model_tokens from "../model/tokens.js";
import type * as model_views from "../model/views.js";
import type * as organize from "../organize.js";
import type * as reminders from "../reminders.js";
import type * as routines from "../routines.js";
import type * as tasks from "../tasks.js";
import type * as validators from "../validators.js";
import type * as views from "../views.js";
import type * as webPush from "../webPush.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agent: typeof agent;
  assistant: typeof assistant;
  crons: typeof crons;
  goals: typeof goals;
  http: typeof http;
  maintenance: typeof maintenance;
  "model/activity": typeof model_activity;
  "model/asks": typeof model_asks;
  "model/focus": typeof model_focus;
  "model/owner": typeof model_owner;
  "model/profile": typeof model_profile;
  "model/progress": typeof model_progress;
  "model/reminders": typeof model_reminders;
  "model/routines": typeof model_routines;
  "model/search": typeof model_search;
  "model/spaces": typeof model_spaces;
  "model/tasks": typeof model_tasks;
  "model/tokens": typeof model_tokens;
  "model/views": typeof model_views;
  organize: typeof organize;
  reminders: typeof reminders;
  routines: typeof routines;
  tasks: typeof tasks;
  validators: typeof validators;
  views: typeof views;
  webPush: typeof webPush;
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
