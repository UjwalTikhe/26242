/** SHA-256 (hex) of a Blob/File via Web Crypto — the on-device hash the
 *  evidence chain expects (`clientSha256`). */
export async function sha256Hex(data: Blob | ArrayBuffer | string): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}