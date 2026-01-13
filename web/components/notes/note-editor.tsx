"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useState } from "react";

const lowlight = createLowlight(common);

interface NoteEditorProps {
  content?: string;
  onUpdate?: (html: string, json: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

export function NoteEditor({
  content,
  onUpdate,
  editable = true,
  placeholder = "Start writing... Use / for commands",
  className = "",
}: NoteEditorProps) {
  const [isMounted, setIsMounted] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
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
    content: content || "",
    editable,
    editorProps: {
      attributes: {
        class: `prose prose-invert prose-sm sm:prose-base max-w-none focus:outline-none min-h-[200px] ${className}`,
      },
    },
    onUpdate: ({ editor }) => {
      if (onUpdate) {
        onUpdate(editor.getHTML(), editor.getJSON());
      }
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  if (!isMounted) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-glass rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-glass rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-glass rounded w-5/6"></div>
      </div>
    );
  }

  return (
    <div className="note-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

export { Editor };
