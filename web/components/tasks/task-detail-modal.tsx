"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Id } from "@convex/_generated/dataModel";

interface TaskDetailModalProps {
  taskId: Id<"tasks"> | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskDetailModal({ taskId, isOpen, onClose }: TaskDetailModalProps) {
  const task = useQuery(api.tasks.get, taskId ? { id: taskId } : "skip");
  const subtasks = useQuery(api.tasks.getSubtasks, taskId ? { parentTaskId: taskId } : "skip");
  const reminders = useQuery(api.reminders.getForTask, taskId ? { taskId } : "skip");

  const updateTask = useMutation(api.tasks.update);
  const completeTask = useMutation(api.tasks.complete);
  const uncompleteTask = useMutation(api.tasks.uncomplete);
  const archiveTask = useMutation(api.tasks.archive);
  const deleteTask = useMutation(api.tasks.remove);
  const createSubtask = useMutation(api.tasks.create);
  const completeSubtask = useMutation(api.tasks.complete);
  const uncompleteSubtask = useMutation(api.tasks.uncomplete);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editTags, setEditTags] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!task) return null;

  const startEditing = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "");
    setEditDueTime(task.dueTime || "");
    setEditTags(task.tags.join(", "));
    setIsEditing(true);
  };

  const handleSave = async () => {
    const tags = editTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    await updateTask({
      id: taskId!,
      title: editTitle,
      description: editDescription || undefined,
      dueDate: editDueDate ? new Date(editDueDate).getTime() : undefined,
      dueTime: editDueTime || undefined,
      tags,
    });
    setIsEditing(false);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    await createSubtask({
      title: newSubtask.trim(),
      parentTaskId: taskId!,
    });
    setNewSubtask("");
  };

  const handleDelete = async () => {
    await deleteTask({ id: taskId! });
    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Task" : undefined} size="lg">
      {showDeleteConfirm ? (
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this task?</p>
          <p className="text-sm text-text-secondary">This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      ) : isEditing ? (
        <div className="space-y-4">
          <Input
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
          />
          <Textarea
            label="Description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={4}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Due Date"
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
            />
            <Input
              label="Due Time"
              type="time"
              value={editDueTime}
              onChange={(e) => setEditDueTime(e.target.value)}
            />
          </div>
          <Input
            label="Tags"
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="work, urgent (comma separated)"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <Checkbox
              checked={task.status === "completed"}
              onChange={() => {
                if (task.status === "completed") {
                  uncompleteTask({ id: taskId! });
                } else {
                  completeTask({ id: taskId! });
                }
              }}
              className="mt-1"
            />
            <div className="flex-1">
              <h2
                className={`text-xl font-semibold text-text-primary ${
                  task.status === "completed" ? "line-through opacity-60" : ""
                }`}
              >
                {task.title}
              </h2>
              {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {task.tags.map((tag) => (
                    <Badge key={tag}>#{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Due date/time */}
          {task.dueDate && (
            <div className="flex items-center gap-2 text-text-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>{formatDate(task.dueDate)}</span>
              {task.dueTime && <span>at {task.dueTime}</span>}
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-2">Description</h3>
              <p className="text-text-primary whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Subtasks */}
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Subtasks</h3>
            <div className="space-y-2">
              {subtasks?.map((subtask) => (
                <div
                  key={subtask._id}
                  className="flex items-center gap-3 glass-card p-3"
                >
                  <Checkbox
                    checked={subtask.status === "completed"}
                    onChange={() => {
                      if (subtask.status === "completed") {
                        uncompleteSubtask({ id: subtask._id });
                      } else {
                        completeSubtask({ id: subtask._id });
                      }
                    }}
                  />
                  <span
                    className={`text-text-primary ${
                      subtask.status === "completed" ? "line-through opacity-60" : ""
                    }`}
                  >
                    {subtask.title}
                  </span>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a subtask..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={handleAddSubtask}
                  disabled={!newSubtask.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Reminders */}
          {reminders && reminders.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Reminders</h3>
              <div className="space-y-2">
                {reminders.map((reminder) => (
                  <div
                    key={reminder._id}
                    className="flex items-center gap-2 text-text-secondary text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    <span>{new Date(reminder.triggerAt).toLocaleString()}</span>
                    {reminder.isRecurring && <Badge size="sm">Recurring</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t border-glass-border">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  archiveTask({ id: taskId! });
                  onClose();
                }}
              >
                Archive
              </Button>
              <Button onClick={startEditing}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
