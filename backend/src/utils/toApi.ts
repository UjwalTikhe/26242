/**
 * Serialization: mongoose lean() objects → contract-shaped JSON.
 * - _id → id
 * - Date → ISO string (Z)  (contract DateTime allows offset/Z)
 * - deep, arrays included
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function toApi<T = any>(value: unknown): T {
  if (value === null || value === undefined) return value as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map((v) => toApi(v)) as T;
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toApi(v);
    }
    if ('_id' in out && !('id' in out)) {
      out.id = out._id;
      delete out._id;
    }
    return out;
  }
  return value as T;
}
