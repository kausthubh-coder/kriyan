"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Id } from "@convex/_generated/dataModel";

interface CreateReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: Id<"tasks">;
}

export function CreateReminderModal({ isOpen, onClose, taskId }: CreateReminderModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [interval, setInterval] = useState(1);
  const [isAlarm, setIsAlarm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createReminder = useMutation(api.reminders.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !time) return;

    setIsSubmitting(true);
    try {
      const triggerAt = new Date(`${date}T${time}`).getTime();

      await createReminder({
        title: title.trim(),
        triggerAt,
        taskId,
        isRecurring,
        recurrenceRule: isRecurring
          ? {
              frequency,
              interval,
            }
          : undefined,
        isAlarm,
      });

      // Reset form
      setTitle("");
      setDate("");
      setTime("");
      setIsRecurring(false);
      setFrequency("daily");
      setInterval(1);
      setIsAlarm(false);
      onClose();
    } catch (error) {
      console.error("Failed to create reminder:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Reminder" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          placeholder="Reminder title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>

        {/* Recurring toggle */}
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

        {/* Alarm toggle */}
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
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!title.trim() || !date || !time || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Reminder"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
