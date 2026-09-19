export function isValidChunkSize(size: number) { return size > 0 && size % (256 * 1024) === 0; }
export function nextOffset(range: string | null, fallback = 0) { const last = range?.match(/-(\d+)$/)?.[1]; return last ? Number(last) + 1 : fallback; }
export function retryDelay(attempt: number, retryAfterMs = 0) { return Math.max(retryAfterMs, Math.min(1000 * 2 ** attempt, 16000)); }
export function uploadChunks(totalBytes: number, chunkSize: number) { const parts: Array<[number, number]> = []; for (let start = 0; start < totalBytes; start += chunkSize) parts.push([start, Math.min(start + chunkSize, totalBytes)]); return parts; }
