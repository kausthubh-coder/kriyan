'use client'

import type { AppNoteItem } from '@kriyan/client-core'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'

import type { NoteDraft } from '@/src/client-core/web-repository'

const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }

function parseContent(note?: AppNoteItem): object {
  if (!note) return EMPTY_DOCUMENT
  try { return JSON.parse(note.contentJson) as object } catch { return EMPTY_DOCUMENT }
}

export function NoteEditor({ note, busy, onSave, onCancel }: {
  note?: AppNoteItem
  busy: boolean
  onSave: (draft: NoteDraft) => Promise<boolean>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '')
  const [entityId, setEntityId] = useState(note?.entityId ?? '')
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Write what should remain useful later…' })],
    content: parseContent(note),
    immediatelyRender: false,
  })

  useEffect(() => {
    if (editor) editor.commands.setContent(parseContent(note))
  }, [editor, note])

  async function save(): Promise<void> {
    if (!editor) return
    const plainTextPreview = editor.getText().trim().slice(0, 4096)
    const ok = await onSave({
      title: title.trim() || undefined,
      contentJson: JSON.stringify(editor.getJSON()),
      plainTextPreview,
      wordCount: plainTextPreview ? plainTextPreview.split(/\s+/).length : 0,
      tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      entityId: entityId.trim() || undefined,
    })
    if (ok && !note) {
      setTitle('')
      setTags('')
      setEntityId('')
      editor.commands.setContent(EMPTY_DOCUMENT)
    }
  }

  return (
    <section className="note-editor" aria-label={note ? 'Edit note' : 'New note'}>
      <input className="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" aria-label="Note title" />
      <div className="editor-toolbar" aria-label="Text formatting">
        <button type="button" aria-pressed={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-pressed={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" aria-pressed={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</button>
        <button type="button" aria-pressed={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      </div>
      <EditorContent editor={editor} />
      <div className="note-meta-grid">
        <label><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="product, vps" /></label>
        <label><span>Linked entity</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="entity:kriyan" /></label>
      </div>
      <div className="form-actions">
        <button className="primary-button" type="button" onClick={() => void save()} disabled={busy || !editor}>{busy ? 'Saving…' : 'Save note'}</button>
        <button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </section>
  )
}
