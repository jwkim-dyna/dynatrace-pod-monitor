export function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export const asText = (value: unknown): string => typeof value === 'string' ? value : '';
export const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const asObjects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(asObject) : [];
export function asDate(value: unknown): number | null {
  const date = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? date : null;
}
