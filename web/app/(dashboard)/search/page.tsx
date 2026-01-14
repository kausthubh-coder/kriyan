"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  const tasks = useQuery(api.tasks.search, query.length >= 2 ? { query } : "skip");
  const notes = useQuery(api.notes.search, query.length >= 2 ? { query } : "skip");
  const files = useQuery(api.files.search, query.length >= 2 ? { query } : "skip");
  const voiceNotes = useQuery(
    api.voiceNotes.search,
    query.length >= 2 ? { query } : "skip"
  );

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Search</h1>
        <p className="text-text-secondary mt-1">Search across tasks, notes, files, and voice notes</p>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search everything..."
        className="w-full"
      />

      {query.length < 2 ? (
        <Card className="p-8 text-center text-text-secondary">
          Enter at least 2 characters to search
        </Card>
      ) : (
        <div className="space-y-4">
          <Section title="Tasks" items={tasks ?? []} renderItem={(task) => (
            <div className="flex items-center justify-between">
              <span>{task.title}</span>
              <Badge>{task.status}</Badge>
            </div>
          )} />

          <Section title="Notes" items={notes ?? []} renderItem={(note) => (
            <div className="flex items-center justify-between">
              <span>{note.title}</span>
              {note.tags.length > 0 && <Badge>#{note.tags[0]}</Badge>}
            </div>
          )} />

          <Section title="Files" items={files ?? []} renderItem={(file) => (
            <div className="flex items-center justify-between">
              <span>{file.fileName}</span>
              <Badge>{file.sourceType}</Badge>
            </div>
          )} />

          <Section title="Voice Notes" items={voiceNotes ?? []} renderItem={(voice) => (
            <div className="flex items-center justify-between">
              <span>{voice.title || "Untitled"}</span>
              <Badge>{voice.transcriptionStatus}</Badge>
            </div>
          )} />
        </div>
      )}
    </div>
  );
}

function Section<T>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium text-text-secondary">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-text-muted">No results</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="text-text-primary">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
