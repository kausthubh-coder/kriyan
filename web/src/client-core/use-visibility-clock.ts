'use client'

import { nextClockDelay } from '@kriyan/client-core'
import { useEffect, useState } from 'react'

export function useVisibilityClock(heartbeatTimestamps: readonly number[]): number | null {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      const current = Date.now()
      setNow(current)
      timer = setTimeout(schedule, nextClockDelay(current, heartbeatTimestamps))
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [heartbeatTimestamps])

  return now
}
