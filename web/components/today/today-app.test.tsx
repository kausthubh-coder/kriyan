import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { queuedActivityFixture, reminderFixture, taskFixture } from './fixtures'
import { ActivityRow, ReminderRow, TaskRow } from './today-app'

describe('Today presentational components', () => {
  test('renders task and reminder fixtures with native controls', () => {
    const task = renderToStaticMarkup(<TaskRow task={taskFixture} />)
    const reminder = renderToStaticMarkup(<ReminderRow reminder={reminderFixture} />)
    expect(task).toContain('Complete Practice Korean')
    expect(task).toContain('Practice Korean')
    expect(reminder).toContain('scheduled')
  })

  test('renders the queued state as queued rather than running', () => {
    const markup = renderToStaticMarkup(<ActivityRow item={queuedActivityFixture} onClick={() => {}} />)
    expect(markup).toContain('queued')
    expect(markup).not.toContain('running')
  })
})
