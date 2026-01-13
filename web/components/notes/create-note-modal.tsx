"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (noteId: string) => void;
}

export function CreateNoteModal({ isOpen, onClose, onCreated }: CreateNoteModalProps) {
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createNote = useMutation(api.notes.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      const noteId = await createNote({
        title: title.trim(),
        tags,
      });

      setTitle("");
      setTagsInput("");
      onClose();
      onCreated(noteId);
    } catch (error) {
      console.error("Failed to create note:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setTagsInput("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Note" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        <Input
          label="Tags"
          placeholder="work, ideas, project (comma separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Note"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
