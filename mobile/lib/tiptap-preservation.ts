export type TipTapEditInspection =
  | { editable: true; text: string }
  | { editable: false; text: string; reason: string }

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

/**
 * Mobile v1 edits only the exact lossless plain-text TipTap subset. Rich or
 * unknown structures remain byte-identical and are presented honestly read-only.
 */
export function inspectTipTapForPlainTextEditing(contentJson: string, preview = ''): TipTapEditInspection {
  let parsed: unknown
  try { parsed = JSON.parse(contentJson) } catch { return { editable: false, text: preview, reason: 'This note contains invalid or unsupported rich content.' } }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { editable: false, text: preview, reason: 'This note uses an unsupported rich-content shape.' }
  const doc = parsed as Record<string, unknown>
  if (doc.type !== 'doc' || !Array.isArray(doc.content) || !exactKeys(doc, ['content', 'type'])) return { editable: false, text: preview, reason: 'Rich TipTap attributes or nodes are preserved in read-only mode.' }
  const lines: string[] = []
  for (const node of doc.content) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return { editable: false, text: preview, reason: 'Unknown TipTap nodes are preserved in read-only mode.' }
    const paragraph = node as Record<string, unknown>
    if (paragraph.type !== 'paragraph' || !Array.isArray(paragraph.content) || !exactKeys(paragraph, ['content', 'type'])) return { editable: false, text: preview, reason: 'Unknown TipTap nodes or attributes are preserved in read-only mode.' }
    let line = ''
    for (const child of paragraph.content) {
      if (typeof child !== 'object' || child === null || Array.isArray(child)) return { editable: false, text: preview, reason: 'Unknown TipTap content is preserved in read-only mode.' }
      const text = child as Record<string, unknown>
      if (text.type !== 'text' || typeof text.text !== 'string' || !exactKeys(text, ['text', 'type'])) return { editable: false, text: preview, reason: 'TipTap marks, attributes, and unknown nodes are preserved in read-only mode.' }
      line += text.text
    }
    lines.push(line)
  }
  return { editable: true, text: lines.join('\n') }
}
