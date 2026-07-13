'use client'

import { useEffect, useState } from 'react'

export const HEARTBEAT_FRESHNESS_MS = 60_000
const MIN_TIMER_MS = 50

export function nextClockDelay(now: number, heartbeatTimestamps: readonly number[]): number {
  const nextMinute = now + (60_000 - (now % 60_000))
  const heartbeatBoundaries = heartbeatTimestamps
    .map((timestamp) => timestamp + HEARTBEAT_FRESHNESS_MS + 1)
    .filter((timestamp) => timestamp > now)
  const next = Math.min(nextMinute, ...heartbeatBoundaries)
  return Math.max(MIN_TIMER_MS, next - now)
}

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
    const onVisibility = (): void => schedule()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [heartbeatTimestamps])

  return now
}
