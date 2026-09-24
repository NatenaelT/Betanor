/** Normalize PostgREST to-one objects and to-many arrays for legacy relation views. */
export function relationArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
