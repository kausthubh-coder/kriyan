"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TaskCard,
  CreateTaskModal,
  TaskDetailModal,
  CreateReminderModal,
} from "@/components/tasks";

type ViewMode = "today" | "upcoming" | "all" | "completed";

export default function TasksPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);

  // Queries based on view mode
  const todayTasks = useQuery(api.tasks.listToday, viewMode === "today" ? {} : "skip");
  const upcomingTasks = useQuery(api.tasks.listUpcoming, viewMode === "upcoming" ? {} : "skip");
  const allTasks = useQuery(api.tasks.list, viewMode === "all" ? { status: "pending" } : "skip");
  const completedTasks = useQuery(
    api.tasks.list,
    viewMode === "completed" ? { status: "completed" } : "skip"
  );
  const overdueTasks = useQuery(api.tasks.listOverdue, viewMode === "today" ? {} : "skip");
  const searchResults = useQuery(
    api.tasks.search,
    searchQuery.length >= 2 ? { query: searchQuery } : "skip"
  );

  const completeTask = useMutation(api.tasks.complete);
  const uncompleteTask = useMutation(api.tasks.uncomplete);

  // Determine which tasks to display
  const getDisplayTasks = () => {
    if (searchQuery.length >= 2 && searchResults) {
      return searchResults;
    }

    switch (viewMode) {
      case "today":
        return todayTasks ?? [];
      case "upcoming":
        return upcomingTasks ?? [];
      case "all":
        return allTasks ?? [];
      case "completed":
        return completedTasks ?? [];
      default:
        return [];
    }
  };

  const tasks = getDisplayTasks();
  const overdueList = viewMode === "today" ? overdueTasks ?? [] : [];

  const handleComplete = async (id: Id<"tasks">) => {
    await completeTask({ id });
  };

  const handleUncomplete = async (id: Id<"tasks">) => {
    await uncompleteTask({ id });
  };

  const viewModes: { key: ViewMode; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "all", label: "All" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Tasks</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setIsReminderModalOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            Reminder
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Task
          </Button>
        </div>
      </div>

      {/* View mode tabs & Search */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 glass-card p-1">
          {viewModes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => {
                setViewMode(mode.key);
                setSearchQuery("");
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === mode.key
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-text-primary hover:bg-glass-hover"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

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
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-64"
          />
        </div>
      </div>

      {/* Overdue tasks section (only in Today view) */}
      {viewMode === "today" && overdueList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-error mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Overdue
          </h2>
          <div className="space-y-3">
            {overdueList.map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onClick={setSelectedTaskId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tasks list */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-text-secondary">
              {searchQuery
                ? "No tasks found matching your search"
                : viewMode === "completed"
                ? "No completed tasks yet"
                : "No tasks here. Create one to get started!"}
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onClick={setSelectedTaskId}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        isOpen={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
      />

      <CreateReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
      />
    </div>
  );
}
