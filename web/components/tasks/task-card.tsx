"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Id } from "@convex/_generated/dataModel";

interface Task {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  status: "pending" | "completed" | "archived";
  tags: string[];
  dueDate?: number;
  dueTime?: string;
}

interface TaskCardProps {
  task: Task;
  onComplete: (id: Id<"tasks">) => void;
  onUncomplete: (id: Id<"tasks">) => void;
  onClick: (id: Id<"tasks">) => void;
}

export function TaskCard({ task, onComplete, onUncomplete, onClick }: TaskCardProps) {
  const isCompleted = task.status === "completed";

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };

  const isOverdue = () => {
    if (!task.dueDate || isCompleted) return false;
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    return dueDate < now;
  };

  return (
    <div
      className={`glass-card p-4 cursor-pointer hover:bg-glass-hover transition-all duration-200 animate-fadeIn ${
        isCompleted ? "opacity-60" : ""
      }`}
      onClick={() => onClick(task._id)}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isCompleted}
            onChange={() => {
              if (isCompleted) {
                onUncomplete(task._id);
              } else {
                onComplete(task._id);
              }
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className={`font-medium text-text-primary ${
              isCompleted ? "line-through text-text-muted" : ""
            }`}
          >
            {task.title}
          </h3>

          {/* Description preview */}
          {task.description && (
            <p className="text-sm text-text-secondary mt-1 line-clamp-1">
              {task.description}
            </p>
          )}

          {/* Tags */}
          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {task.tags.map((tag) => (
                <Badge key={tag} variant="default" size="sm">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Due date */}
        {task.dueDate && (
          <div className="flex flex-col items-end gap-1 text-sm shrink-0">
            <span
              className={`flex items-center gap-1 ${
                isOverdue() ? "text-error" : "text-text-secondary"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formatDate(task.dueDate)}
            </span>
            {task.dueTime && (
              <span className="text-text-muted flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {task.dueTime}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
