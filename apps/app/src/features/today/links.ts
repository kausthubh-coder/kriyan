// Where Today's buttons go, and the routine actions contract A adds.
//
// /menu and /goals are slice B's routes (the shell redesign); typed routes only know them once
// B lands, so they're named here once. Routine ticks are contract A's mutations
// (routines.tickPart, routines.tickAll, routines.remove); until A lands no routine exists outside
// the dev fixture, so these only say so.

import type { Href } from "expo-router";
import { showToast } from "@/ui/toast";
import type { RoutineView } from "./model";

export const MENU_ROUTE = "/menu" as Href;
export const GOALS_ROUTE = "/goals" as Href;
export const SETTINGS_ROUTE: Href = "/settings";

const notYet = () => showToast("Routines save once this version of Kriyan has them.");

export function tickRoutinePart(_routine: RoutineView, _index: number, _date: string, _done: boolean) {
  notYet();
}

export function tickRoutineAll(_routine: RoutineView, _date: string, _done: boolean) {
  notYet();
}

export function removeRoutine(_routine: RoutineView) {
  notYet();
}
