"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteCard, CreateNoteModal } from "@/components/notes";

export default function NotesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Queries
  const allNotes = useQuery(
    api.notes.list,
    searchQuery.length >= 2 ? "skip" : {}
  );
  const searchResults = useQuery(
    api.notes.search,
    searchQuery.length >= 2 ? { query: searchQuery } : "skip"
  );

  const notes = searchQuery.length >= 2 ? searchResults : allNotes;

  const handleNoteClick = (id: Id<"notes">) => {
    router.push(`/notes/${id}`);
  };

  const handleNoteCreated = (noteId: string) => {
    router.push(`/notes/${noteId}`);
  };

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Notes</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Note
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        {notes === undefined ? (
          // Loading state
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-glass rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-glass rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <svg
              className="w-12 h-12 mx-auto text-text-muted mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-text-secondary">
              {searchQuery
                ? "No notes found matching your search"
                : "No notes yet. Create one to get started!"}
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard key={note._id} note={note} onClick={handleNoteClick} />
          ))
        )}
      </div>

      {/* Create Modal */}
      <CreateNoteModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleNoteCreated}
      />
    </div>
  );
}
