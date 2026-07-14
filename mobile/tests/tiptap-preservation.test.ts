import { expect, test } from 'bun:test'

import { inspectTipTapForPlainTextEditing } from '../lib/tiptap-preservation'

test('allows only the exact lossless plain-text TipTap subset', () => {
  expect(inspectTipTapForPlainTextEditing('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"One"}]}]}')).toEqual({ editable: true, text: 'One' })
})

test('refuses destructive edits and leaves unknown TipTap bytes untouched', () => {
  const rich = '{"type":"doc","attrs":{"version":2},"content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","marks":[{"type":"bold"}],"text":"Rich"}]},{"type":"mystery","attrs":{"keep":true}}]}'
  const inspection = inspectTipTapForPlainTextEditing(rich, 'Rich')
  expect(inspection.editable).toBe(false)
  expect(rich).toBe('{"type":"doc","attrs":{"version":2},"content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","marks":[{"type":"bold"}],"text":"Rich"}]},{"type":"mystery","attrs":{"keep":true}}]}')
})
