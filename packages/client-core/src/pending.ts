export interface PendingTransition {
  acquired: boolean
  keys: Set<string>
}

export function beginPending(
  current: ReadonlySet<string>,
  key: string,
): PendingTransition {
  if (current.has(key)) return { acquired: false, keys: new Set(current) }
  const keys = new Set(current)
  keys.add(key)
  return { acquired: true, keys }
}

export function endPending(
  current: ReadonlySet<string>,
  key: string,
): Set<string> {
  const keys = new Set(current)
  keys.delete(key)
  return keys
}
