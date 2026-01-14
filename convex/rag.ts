"use node";

import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";
import { components } from "./_generated/api";
import { Value } from "convex/values";

// Define filter schemas for semantic search
type FilterSchemas = {
  sourceType: string;
  tags: string[];
};

// Define metadata schema
type EntryMetadata = {
  sourceId: string;
  title?: string;
  tags?: string[];
  createdAt: number;
};

// Create the RAG instance with text-embedding-3-small
// This uses OpenAI via OpenRouter (using OPENAI_API_KEY env var)
export const rag = new RAG<FilterSchemas, EntryMetadata>(components.rag, {
  embeddingDimension: 1536, // text-embedding-3-small dimension
  textEmbeddingModel: openai.textEmbeddingModel("text-embedding-3-small"),
  filterNames: ["sourceType", "tags"],
});

/**
 * Content types for RAG indexing
 */
export type ContentSource = "task" | "note" | "voiceNote" | "file" | "noteImage";

/**
 * Helper to create filter values for an entry
 */
export function createFilterValues(
  sourceType: ContentSource,
  tags: string[]
): { name: string; value: Value }[] {
  return [
    { name: "sourceType", value: sourceType },
    { name: "tags", value: tags },
  ];
}

/**
 * Helper to build searchable text from content
 */
export function buildSearchableText(parts: {
  title?: string;
  content?: string;
  description?: string;
  tags?: string[];
}): string {
  const sections: string[] = [];

  if (parts.title) {
    sections.push(`# ${parts.title}`);
  }

  if (parts.description) {
    sections.push(parts.description);
  }

  if (parts.content) {
    sections.push(parts.content);
  }

  if (parts.tags && parts.tags.length > 0) {
    sections.push(`Tags: ${parts.tags.join(", ")}`);
  }

  return sections.join("\n\n");
}
