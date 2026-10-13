// The screens' queries. Each waits for Convex to have the Clerk token, so a query never
// runs signed out; `undefined` means loading.

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { useClock } from "./time";

export type TodayView = FunctionReturnType<typeof api.views.today>;
export type WeekView = FunctionReturnType<typeof api.views.week>;
export type SpaceView = FunctionReturnType<typeof api.views.space>;
export type ProgressView = FunctionReturnType<typeof api.views.progress>;
export type SpaceNode = FunctionReturnType<typeof api.views.spaces>[number];
export type TaskDoc = NonNullable<FunctionReturnType<typeof api.views.task>>;
export type TaskView = TodayView["anytime"][number];
export type Profile = FunctionReturnType<typeof api.account.profile>;

function useAuthed() {
  return useConvexAuth().isAuthenticated;
}

export function useTodayView() {
  const { today } = useClock();
  return useQuery(api.views.today, useAuthed() ? { today } : "skip");
}

export function useWeekView(start: string) {
  const { today } = useClock();
  return useQuery(api.views.week, useAuthed() ? { start, today } : "skip");
}

export function useInboxView() {
  return useQuery(api.views.inbox, useAuthed() ? {} : "skip");
}

export function useSpaceView(id: Id<"spaces">) {
  const { today } = useClock();
  return useQuery(api.views.space, useAuthed() ? { id, today } : "skip");
}

export function useProgressView() {
  const { today } = useClock();
  return useQuery(api.views.progress, useAuthed() ? { today } : "skip");
}

export function useSpaces() {
  return useQuery(api.views.spaces, useAuthed() ? {} : "skip");
}

export function useTaskDoc(id: Id<"tasks">) {
  return useQuery(api.views.task, useAuthed() ? { id } : "skip");
}

export function useProfile() {
  return useQuery(api.account.profile, useAuthed() ? {} : "skip");
}

export function useAccessTokens() {
  return useQuery(api.account.tokens, useAuthed() ? {} : "skip");
}
