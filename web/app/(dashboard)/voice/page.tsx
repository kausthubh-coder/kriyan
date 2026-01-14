"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Id } from "@/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";

type TranscriptionStatus = "pending" | "processing" | "completed" | "failed";

interface VoiceNote {
  _id: Id<"voiceNotes">;
  _creationTime: number;
  title?: string;
  durationMs?: number;
  transcription?: string;
  transcriptionStatus: TranscriptionStatus;
  tags: string[];
  createdAt: number;
}

const statusColors: Record<TranscriptionStatus, string> = {
  pending: "bg-warning/20 text-warning",
  processing: "bg-accent/20 text-accent",
  completed: "bg-success/20 text-success",
  failed: "bg-error/20 text-error",
};

export default function VoicePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedVoiceNote, setSelectedVoiceNote] = useState<VoiceNote | null>(null);

  // Queries
  const voiceNotes = useQuery(api.voiceNotes.list, { limit: 50 }) as VoiceNote[] | undefined;
  const searchResults = useQuery(
    api.voiceNotes.search,
    searchQuery.length >= 2 ? { query: searchQuery } : "skip"
  ) as VoiceNote[] | undefined;

  const displayedNotes = searchQuery.length >= 2 ? searchResults : voiceNotes;

  const formatDuration = (ms?: number) => {
    if (!ms) return "0:00";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (timestamp: number) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Voice Notes</h1>
          <p className="text-text-secondary mt-1">
            Record and transcribe voice memos
          </p>
        </div>
        <Button onClick={() => setShowRecordModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Record
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search voice notes..."
            className="w-full"
          />
        </div>
      </div>

      {/* Voice Notes List */}
      {displayedNotes?.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-hover flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-text-secondary">No voice notes yet</p>
          <p className="text-text-muted text-sm mt-1">Record your first voice note to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedNotes?.map((note) => (
            <VoiceNoteCard
              key={note._id}
              voiceNote={note}
              formatDuration={formatDuration}
              formatDate={formatDate}
              onClick={() => setSelectedVoiceNote(note)}
            />
          ))}
        </div>
      )}

      {/* Record Modal */}
      {showRecordModal && (
        <RecordModal onClose={() => setShowRecordModal(false)} />
      )}

      {/* View/Edit Modal */}
      {selectedVoiceNote && (
        <ViewModal
          voiceNote={selectedVoiceNote}
          onClose={() => setSelectedVoiceNote(null)}
          formatDuration={formatDuration}
        />
      )}
    </div>
  );
}

function VoiceNoteCard({
  voiceNote,
  formatDuration,
  formatDate,
  onClick,
}: {
  voiceNote: VoiceNote;
  formatDuration: (ms?: number) => string;
  formatDate: (timestamp: number) => string;
  onClick: () => void;
}) {
  return (
    <Card
      className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-text-primary truncate">
            {voiceNote.title || "Untitled Voice Note"}
          </h3>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-text-muted">
              {formatDate(voiceNote.createdAt)}
            </span>
            {voiceNote.durationMs && (
              <>
                <span className="text-xs text-text-muted">-</span>
                <span className="text-xs text-text-muted">
                  {formatDuration(voiceNote.durationMs)}
                </span>
              </>
            )}
            <Badge className={statusColors[voiceNote.transcriptionStatus]}>
              {voiceNote.transcriptionStatus}
            </Badge>
          </div>

          {voiceNote.transcription && (
            <p className="text-sm text-text-secondary mt-2 line-clamp-2">
              {voiceNote.transcription}
            </p>
          )}

          {voiceNote.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {voiceNote.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <svg className="w-5 h-5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Card>
  );
}

function RecordModal({ onClose }: { onClose: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const createVoiceNote = useMutation(api.voiceNotes.create);
  const generateUploadUrl = useMutation(api.voiceNotes.generateUploadUrl);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setElapsedTime(0);

      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError("Failed to access microphone. Please check permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }

    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsedTime(0);
  }, [audioUrl]);

  const handleSave = async () => {
    if (!audioBlob) return;

    setIsSaving(true);
    setError(null);

    try {
      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload audio
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type },
        body: audioBlob,
      });

      if (!result.ok) {
        throw new Error("Failed to upload audio");
      }

      const { storageId } = await result.json();

      // Create voice note
      await createVoiceNote({
        title: title.trim() || undefined,
        storageId,
        durationMs: elapsedTime,
        tags: tags.length > 0 ? tags : undefined,
      });

      onClose();
    } catch (err) {
      console.error("Failed to save:", err);
      setError("Failed to save voice note. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass rounded-xl border border-glass-border p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {audioBlob ? "Review Recording" : "New Recording"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-glass-hover rounded-lg"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/20 text-error text-sm">
            {error}
          </div>
        )}

        {/* Recording UI */}
        <div className="flex flex-col items-center py-8">
          <div className="w-full h-24 rounded-xl bg-glass-hover flex items-center justify-center mb-6">
            {isRecording && !isPaused ? (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-error animate-pulse" />
                <span className="text-error font-medium">Recording...</span>
              </div>
            ) : (
              <span className="text-4xl font-light text-text-primary tabular-nums">
                {formatDuration(elapsedTime)}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {audioBlob ? (
              <>
                <button
                  onClick={() => audioRef.current?.play()}
                  className="w-14 h-14 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
                >
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <button
                  onClick={discardRecording}
                  className="w-14 h-14 rounded-full bg-error flex items-center justify-center hover:bg-error/80 transition-colors"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <audio ref={audioRef} src={audioUrl || undefined} />
              </>
            ) : (
              <>
                {isRecording ? (
                  <>
                    {isPaused ? (
                      <button
                        onClick={resumeRecording}
                        className="w-14 h-14 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
                      >
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={pauseRecording}
                        className="w-14 h-14 rounded-full bg-warning flex items-center justify-center hover:bg-warning/80 transition-colors"
                      >
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={stopRecording}
                      className="w-16 h-16 rounded-full bg-error flex items-center justify-center hover:bg-error/80 transition-colors"
                    >
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
                  >
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Title and Tags (only show after recording) */}
        {audioBlob && (
          <div className="space-y-4 border-t border-glass-border pt-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Title (optional)
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Voice note title..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Tags
              </label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  className="flex-1"
                />
                <Button variant="ghost" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      #{tag}
                      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewModal({
  voiceNote,
  onClose,
  formatDuration,
}: {
  voiceNote: VoiceNote;
  onClose: () => void;
  formatDuration: (ms?: number) => string;
}) {
  const [title, setTitle] = useState(voiceNote.title || "");
  const [tags, setTags] = useState(voiceNote.tags);
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch audio URL
  const audioUrl = useQuery(api.voiceNotes.getAudioUrl, { id: voiceNote._id });

  const updateVoiceNote = useMutation(api.voiceNotes.update);
  const removeVoiceNote = useMutation(api.voiceNotes.remove);
  const retryTranscription = useMutation(api.voiceNotes.retryTranscription);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateVoiceNote({
        id: voiceNote._id,
        title: title.trim() || undefined,
        tags,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this voice note?")) return;

    try {
      await removeVoiceNote({ id: voiceNote._id });
      onClose();
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const handleRetry = async () => {
    try {
      await retryTranscription({ id: voiceNote._id });
    } catch (error) {
      console.error("Failed to retry:", error);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass rounded-xl border border-glass-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">Voice Note</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-glass-hover rounded-lg"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Playback */}
        {audioUrl && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-glass-hover mb-6">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <div className="flex-1">
              <div className="text-sm text-text-primary font-medium">
                {formatDuration(voiceNote.durationMs)}
              </div>
              <div className="text-xs text-text-muted">
                {new Date(voiceNote.createdAt).toLocaleDateString()}
              </div>
            </div>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-text-secondary">Status:</span>
          <Badge className={statusColors[voiceNote.transcriptionStatus]}>
            {voiceNote.transcriptionStatus}
          </Badge>
          {voiceNote.transcriptionStatus === "failed" && (
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          )}
        </div>

        {/* Transcription */}
        {voiceNote.transcription && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Transcription
            </label>
            <div className="p-4 rounded-lg bg-glass-hover text-text-primary text-sm leading-relaxed">
              {voiceNote.transcription}
            </div>
          </div>
        )}

        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Voice note title..."
          />
        </div>

        {/* Tags */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Tags
          </label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add a tag..."
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              className="flex-1"
            />
            <Button variant="ghost" onClick={handleAddTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => handleRemoveTag(tag)}
                >
                  #{tag}
                  <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-glass-border">
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="text-error hover:bg-error/10"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
