"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EditorToolbar } from "@/components/notes";

const lowlight = createLowlight(common);

export default function NoteEditorPage() {
  const params = useParams();
  const router = useRouter();
  const noteId = params.id as Id<"notes">;

  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<string>("");

  // Queries
  const note = useQuery(api.notes.get, { id: noteId });

  // Mutations
  const updateNote = useMutation(api.notes.update);
  const touchNote = useMutation(api.notes.touch);
  const deleteNote = useMutation(api.notes.remove);
  const generateUploadUrl = useMutation(api.noteImages.generateUploadUrl);
  const saveImage = useMutation(api.noteImages.saveImage);

  // Initialize editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing... Use / for commands",
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm sm:prose-base max-w-none focus:outline-none min-h-[400px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      contentRef.current = html;
      debouncedSave(html);
    },
  });

  // Initialize title and tags from note data
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setTagsInput(note.tags.join(", "));
    }
  }, [note]);

  // Debounced save function
  const debouncedSave = useCallback(
    (_content: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setIsSaving(true);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await touchNote({ id: noteId });
          setLastSaved(new Date());
        } catch (error) {
          console.error("Failed to save:", error);
        } finally {
          setIsSaving(false);
        }
      }, 1000);
    },
    [noteId, touchNote]
  );

  // Handle title change
  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateNote({ id: noteId, title: newTitle });
          setLastSaved(new Date());
        } catch (error) {
          console.error("Failed to update title:", error);
        }
      }, 500);
    },
    [noteId, updateNote]
  );

  // Handle tags update
  const handleTagsSubmit = useCallback(async () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    try {
      await updateNote({ id: noteId, tags });
      setIsEditingTags(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Failed to update tags:", error);
    }
  }, [noteId, tagsInput, updateNote]);

  // Handle image upload
  const handleImageUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert("Image must be less than 10MB");
        return;
      }

      try {
        // Get upload URL
        const uploadUrl = await generateUploadUrl();

        // Upload file
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = await response.json();

        // Save image metadata
        await saveImage({
          noteId,
          storageId,
          fileName: file.name,
          mimeType: file.type,
        });

        // Get the URL and insert into editor
        // For now, we'll create a placeholder that will be replaced when the image loads
        const tempUrl = URL.createObjectURL(file);
        editor.chain().focus().setImage({ src: tempUrl }).run();

        // Touch note to update timestamp
        await touchNote({ id: noteId });
        setLastSaved(new Date());
      } catch (error) {
        console.error("Failed to upload image:", error);
        alert("Failed to upload image. Please try again.");
      }

      // Clear input
      e.target.value = "";
    },
    [editor, generateUploadUrl, noteId, saveImage, touchNote]
  );

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      await deleteNote({ id: noteId });
      router.push("/notes");
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  }, [deleteNote, noteId, router]);

  // Format last saved time
  const formatLastSaved = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) return "Just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (note === undefined) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="animate-pulse">
          <div className="h-8 bg-glass rounded w-1/3 mb-6"></div>
          <div className="h-4 bg-glass rounded w-full mb-2"></div>
          <div className="h-4 bg-glass rounded w-5/6 mb-2"></div>
          <div className="h-4 bg-glass rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (note === null) {
    return (
      <div className="p-8 max-w-4xl">
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
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-text-secondary mb-4">Note not found</p>
          <Button onClick={() => router.push("/notes")}>Back to Notes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.push("/notes")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Notes
        </button>

        <div className="flex items-center gap-3">
          {/* Save status */}
          <span className="text-xs text-text-muted">
            {isSaving ? (
              "Saving..."
            ) : lastSaved ? (
              `Saved ${formatLastSaved(lastSaved)}`
            ) : (
              ""
            )}
          </span>

          {/* Delete button */}
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        className="w-full text-3xl font-bold text-text-primary bg-transparent border-none outline-none mb-4"
      />

      {/* Tags */}
      <div className="mb-4">
        {isEditingTags ? (
          <div className="flex items-center gap-2">
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="work, ideas, project (comma separated)"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTagsSubmit();
                }
                if (e.key === "Escape") {
                  setIsEditingTags(false);
                  setTagsInput(note.tags.join(", "));
                }
              }}
              autoFocus
            />
            <Button size="sm" onClick={handleTagsSubmit}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsEditingTags(false);
                setTagsInput(note.tags.join(", "));
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div
            className="flex flex-wrap items-center gap-2 cursor-pointer group"
            onClick={() => setIsEditingTags(true)}
          >
            {note.tags.length > 0 ? (
              note.tags.map((tag) => (
                <Badge key={tag} variant="default">
                  #{tag}
                </Badge>
              ))
            ) : (
              <span className="text-text-muted text-sm">+ Add tags</span>
            )}
            <svg
              className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="glass-card overflow-hidden">
        <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />
        <EditorContent editor={editor} />
      </div>

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
