'use client'

import type { AppNoteItem } from '@kriyan/client-core'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'

import type { NoteDraft } from '@/src/client-core/web-repository'

import styles from './note-editor.module.css'

const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }

function parseContent(note?: AppNoteItem): object {
  if (!note) return EMPTY_DOCUMENT
  try {
    return JSON.parse(note.contentJson) as object
  } catch {
    return EMPTY_DOCUMENT
  }
}

export function NoteEditor({
  note,
  busy,
  onSave,
  onCancel,
}: {
  note?: AppNoteItem
  busy: boolean
  onSave: (draft: NoteDraft) => Promise<boolean>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '')
  const [entityId, setEntityId] = useState(note?.entityId ?? '')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  )
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      Placeholder.configure({
        placeholder: 'Write what should remain useful later…',
      }),
    ],
    content: parseContent(note),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': 'Note body',
        'aria-multiline': 'true',
      },
    },
    onUpdate: () => {
      setDirty(true)
      setSaveState('idle')
    },
  })

  async function save(): Promise<void> {
    if (!editor) return
    const plainTextPreview = editor.getText().trim().slice(0, 4096)
    const ok = await onSave({
      title: title.trim() || undefined,
      contentJson: JSON.stringify(editor.getJSON()),
      plainTextPreview,
      wordCount: plainTextPreview ? plainTextPreview.split(/\s+/).length : 0,
      tags: tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      entityId: entityId.trim() || undefined,
    })
    setSaveState(ok ? 'saved' : 'failed')
    if (ok) setDirty(false)
    if (ok && !note) {
      setTitle('')
      setTags('')
      setEntityId('')
      editor.commands.setContent(EMPTY_DOCUMENT)
    }
  }

  function changeMetadata(update: () => void): void {
    update()
    setDirty(true)
    setSaveState('idle')
  }

  return (
    <section
      className="note-editor"
      aria-label={note ? 'Edit note' : 'New note'}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault()
          void save()
        }
      }}
    >
      <div className={styles.heading}>
        <input
          className="note-title"
          value={title}
          onChange={(event) =>
            changeMetadata(() => setTitle(event.target.value))
          }
          placeholder="Untitled note"
          aria-label="Note title"
        />
        <span
          className={styles.saveState}
          data-state={saveState}
          role="status"
          aria-live="polite"
        >
          {busy
            ? 'Saving…'
            : saveState === 'failed'
              ? 'Save failed — draft kept here'
              : dirty
                ? 'Unsaved changes'
                : saveState === 'saved'
                  ? 'Saved as a new version'
                  : 'Up to date'}
        </span>
      </div>
      <div
        className={`editor-toolbar ${styles.toolbar}`}
        role="toolbar"
        aria-label="Text formatting"
      >
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          disabled={!editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          disabled={!editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          ↷
        </button>
        <span aria-hidden="true" className={styles.separator} />
        <button
          type="button"
          title="Bold"
          aria-label="Bold"
          aria-pressed={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          title="Italic"
          aria-label="Italic"
          aria-pressed={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          title="Highlight"
          aria-label="Highlight"
          aria-pressed={editor?.isActive('highlight')}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        >
          Mark
        </button>
        <button
          type="button"
          title="Inline code"
          aria-label="Inline code"
          aria-pressed={editor?.isActive('code')}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          Code
        </button>
        <span aria-hidden="true" className={styles.separator} />
        <button
          type="button"
          title="Heading 2"
          aria-label="Heading 2"
          aria-pressed={editor?.isActive('heading', { level: 2 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </button>
        <button
          type="button"
          title="Bulleted list"
          aria-label="Bulleted list"
          aria-pressed={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          title="Task list"
          aria-label="Task list"
          aria-pressed={editor?.isActive('taskList')}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          ☑ Tasks
        </button>
        <button
          type="button"
          title="Block quote"
          aria-label="Block quote"
          aria-pressed={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
      </div>
      <EditorContent editor={editor} />
      <div className="note-meta-grid">
        <label>
          <span>Tags</span>
          <input
            value={tags}
            onChange={(event) =>
              changeMetadata(() => setTags(event.target.value))
            }
            placeholder="product, vps"
          />
        </label>
        <label>
          <span>Linked entity</span>
          <input
            value={entityId}
            onChange={(event) =>
              changeMetadata(() => setEntityId(event.target.value))
            }
            placeholder="entity:kriyan"
          />
        </label>
      </div>
      <p className={styles.authority}>
        The editor writes to Convex and works while the agent node is offline.
        Markdown artifacts and Memory projections are derived, inspectable
        outputs—not competing editors.
      </p>
      <div className="form-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => void save()}
          disabled={busy || !editor || (!dirty && note !== undefined)}
        >
          {busy ? 'Saving…' : 'Save version'}
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <span className={styles.keyboardHint}>⌘/Ctrl + S to save</span>
      </div>
    </section>
  )
}
