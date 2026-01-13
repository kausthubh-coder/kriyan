import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rag from "@convex-dev/rag/convex.config";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config";
import timeline from "convex-timeline/convex.config";

const app = defineApp();

// AI Agent - threads, messages, tool calling, streaming
app.use(agent);

// RAG - chunking, embeddings, semantic search
app.use(rag);

// ProseMirror Sync - real-time notes sync
app.use(prosemirrorSync);

// Timeline - undo/redo for notes
app.use(timeline);

export default app;
