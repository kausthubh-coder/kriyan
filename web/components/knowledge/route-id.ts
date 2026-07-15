export function decodeRouteId(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
