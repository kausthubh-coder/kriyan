import type { ActivityItem, ActivityProjectionItem } from './types'
import { deriveActivity } from './view-model'

export interface ActivityAdapter {
  replace(items: readonly ActivityProjectionItem[]): void
  read(): ActivityItem[]
}

export function createActivityAdapter(): ActivityAdapter {
  let activity: ActivityItem[] = []
  return {
    replace(items): void {
      activity = deriveActivity(items)
    },
    read(): ActivityItem[] {
      return activity
    },
  }
}
