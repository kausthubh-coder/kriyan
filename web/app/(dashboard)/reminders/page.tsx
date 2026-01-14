"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { CreateReminderModal } from "@/components/tasks";

interface ReminderItem {
  _id: Id<"reminders">;
  title: string;
  triggerAt: number;
  isRecurring: boolean;
  recurrenceRule?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
    interval: number;
  };
  isAlarm: boolean;
  notified: boolean;
}

export default function RemindersPage() {
  const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const reminders = useQuery(api.reminders.list, { includeNotified: false }) as
    | ReminderItem[]
    | undefined;

  const dismissReminder = useMutation(api.reminders.dismiss);
  const deleteReminder = useMutation(api.reminders.remove);
  const snoozeReminder = useMutation(api.reminders.snooze);

  const sortedReminders = useMemo(() => {
    return (reminders ?? []).slice().sort((a, b) => a.triggerAt - b.triggerAt);
  }, [reminders]);

  const handleSnooze = async (id: Id<"reminders">, minutes: number) => {
    await snoozeReminder({ id, durationMinutes: minutes });
  };

  const handleDismiss = async (id: Id<"reminders">) => {
    await dismissReminder({ id });
  };

  const handleDelete = async (id: Id<"reminders">) => {
    await deleteReminder({ id });
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Reminders</h1>
          <p className="text-text-secondary mt-1">Manage upcoming reminders</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Reminder
        </Button>
      </div>

      <div className="space-y-3">
        {sortedReminders.length === 0 ? (
          <Card className="p-8 text-center text-text-secondary">
            No reminders yet
          </Card>
        ) : (
          sortedReminders.map((reminder) => (
            <Card
              key={reminder._id}
              className="p-4 flex items-center justify-between gap-4 hover:border-primary/50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-text-primary">{reminder.title}</h3>
                  {reminder.isAlarm && <Badge variant="warning">Alarm</Badge>}
                  {reminder.isRecurring && <Badge>Recurring</Badge>}
                </div>
                <div className="text-sm text-text-secondary">
                  {new Date(reminder.triggerAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => handleSnooze(reminder._id, 10)}
                >
                  Snooze 10m
                </Button>
                <Button variant="secondary" onClick={() => handleDismiss(reminder._id)}>
                  Dismiss
                </Button>
                <Button variant="ghost" onClick={() => setSelectedReminder(reminder)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDelete(reminder._id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <CreateReminderModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {selectedReminder && (
        <EditReminderModal
          reminder={selectedReminder}
          onClose={() => setSelectedReminder(null)}
        />
      )}
    </div>
  );
}

function EditReminderModal({
  reminder,
  onClose,
}: {
  reminder: ReminderItem;
  onClose: () => void;
}) {
  const updateReminder = useMutation(api.reminders.update);

  const [title, setTitle] = useState(reminder.title);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(reminder.isRecurring);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly">(
    reminder.recurrenceRule?.frequency ?? "daily"
  );
  const [interval, setInterval] = useState(reminder.recurrenceRule?.interval ?? 1);
  const [isAlarm, setIsAlarm] = useState(reminder.isAlarm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const triggerDate = new Date(reminder.triggerAt);
    setDate(triggerDate.toISOString().split("T")[0]);
    setTime(triggerDate.toTimeString().slice(0, 5));
  }, [reminder.triggerAt]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const triggerAt = new Date(`${date}T${time}`).getTime();
      await updateReminder({
        id: reminder._id,
        title: title.trim(),
        triggerAt,
        isRecurring,
        recurrenceRule: isRecurring
          ? {
              frequency,
              interval,
            }
          : undefined,
        isAlarm,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Reminder" size="md">
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 rounded border-glass-border bg-transparent text-primary focus:ring-primary"
          />
          <span className="text-text-primary">Recurring reminder</span>
        </label>

        {isRecurring && (
          <div className="grid grid-cols-2 gap-4 pl-7">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                className="glass-input px-3 py-2 rounded-lg text-text-primary"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <Input
              label="Every"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
            />
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isAlarm}
            onChange={(e) => setIsAlarm(e.target.checked)}
            className="w-4 h-4 rounded border-glass-border bg-transparent text-primary focus:ring-primary"
          />
          <span className="text-text-primary">High priority alarm</span>
        </label>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
