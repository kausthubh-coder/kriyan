import { ConvexError } from "convex/values";
import type { SpaceColor } from "@kriyan/core/tokens";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { owned } from "./owner";

const MAX_SPACES = 500;

export async function listSpaces(ctx: QueryCtx | MutationCtx, ownerId: string): Promise<Doc<"spaces">[]> {
  const rows = await ctx.db
    .query("spaces")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_SPACES);
  return rows.filter((s) => s.archivedAt === undefined).sort((a, b) => a.order - b.order);
}

export interface SpaceNode {
  _id: Id<"spaces">;
  name: string;
  color: SpaceColor;
  parentId: Id<"spaces"> | null;
  depth: number;
  /** "Work / Kriyan / Launch" */
  path: string;
}

/** Spaces in tree order (parents before children), each with its depth and path. */
export function spaceTree(spaces: Doc<"spaces">[]): SpaceNode[] {
  const byParent = new Map<string, Doc<"spaces">[]>();
  const ids = new Set(spaces.map((s) => s._id as string));
  for (const s of spaces) {
    const key = s.parentId && ids.has(s.parentId) ? s.parentId : "root";
    byParent.set(key, [...(byParent.get(key) ?? []), s]);
  }
  const out: SpaceNode[] = [];
  const walk = (key: string, depth: number, prefix: string) => {
    for (const s of byParent.get(key) ?? []) {
      const path = prefix ? `${prefix} / ${s.name}` : s.name;
      out.push({ _id: s._id, name: s.name, color: s.color, parentId: s.parentId ?? null, depth, path });
      walk(s._id, depth + 1, path);
    }
  };
  walk("root", 0, "");
  return out;
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ConvexError("Give the space a name.");
  if (trimmed.length > 80) throw new ConvexError("Keep space names under 80 characters.");
  return trimmed;
}

export async function createSpace(
  ctx: MutationCtx,
  ownerId: string,
  input: { name: string; color?: SpaceColor; parentId?: Id<"spaces"> },
): Promise<Id<"spaces">> {
  let color = input.color;
  if (input.parentId) {
    const parent = owned(await ctx.db.get(input.parentId), ownerId, "space");
    color ??= parent.color;
  }
  return await ctx.db.insert("spaces", {
    ownerId,
    name: cleanName(input.name),
    color: color ?? "blue",
    ...(input.parentId ? { parentId: input.parentId } : {}),
    order: Date.now(),
  });
}

export async function updateSpace(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"spaces">,
  patch: { name?: string; color?: SpaceColor; parentId?: Id<"spaces"> | null; note?: string },
): Promise<void> {
  owned(await ctx.db.get(id), ownerId, "space");
  if (patch.parentId) {
    // A space can't move inside itself or one of its own children.
    let cursor: Id<"spaces"> | undefined = patch.parentId;
    while (cursor) {
      if (cursor === id) throw new ConvexError("A space can't go inside itself.");
      const parent: Doc<"spaces"> = owned(await ctx.db.get(cursor), ownerId, "space");
      cursor = parent.parentId;
    }
  }
  await ctx.db.patch(id, {
    ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId ?? undefined } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
  });
}

export async function archiveSpace(ctx: MutationCtx, ownerId: string, id: Id<"spaces">): Promise<void> {
  owned(await ctx.db.get(id), ownerId, "space");
  await ctx.db.patch(id, { archivedAt: Date.now() });
}

/**
 * Finds a space by "name" or "parent/child" (case-insensitive), as typed after # in quick add.
 * Creates it when it doesn't exist, so capture never fails.
 */
export async function resolveSpacePath(
  ctx: MutationCtx,
  ownerId: string,
  path: string,
): Promise<Id<"spaces">> {
  const spaces = await listSpaces(ctx, ownerId);
  let parentId: Id<"spaces"> | undefined;
  for (const part of path
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const match =
      spaces.find((s) => s.name.toLowerCase() === part.toLowerCase() && s.parentId === parentId) ??
      (parentId ? undefined : spaces.find((s) => s.name.toLowerCase() === part.toLowerCase()));
    parentId = match
      ? match._id
      : await createSpace(ctx, ownerId, { name: part, ...(parentId ? { parentId } : {}) });
  }
  if (!parentId) throw new ConvexError("Give the space a name after #.");
  return parentId;
}
