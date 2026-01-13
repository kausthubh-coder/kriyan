"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        dueTime: dueTime || undefined,
        tags,
      });

      // Reset form
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setTagsInput("");
      onClose();
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setDueTime("");
    setTagsInput("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Task" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        <Textarea
          label="Description"
          placeholder="Add more details..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Input
            label="Due Time"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>

        <Input
          label="Tags"
          placeholder="work, urgent, project (comma separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
