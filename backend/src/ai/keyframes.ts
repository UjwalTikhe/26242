/**
 * Media helpers for the AI pipeline: pull bytes out of storage, run ffmpeg
 * (bundled via the optional `ffmpeg-static` dependency, or FFMPEG_PATH) to
 * extract evenly-spaced keyframes / 16 kHz mono WAV, then hand off to the
 * vision / ASR clients.
 *
 * Everything degrades gracefully: if ffmpeg is unavailable or a file can't be
 * decoded, we log and return empty/null so the caller routes the item to a
 * human instead of failing the assessment.
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { getStorage } from '../storage/index.js';
import { transcribeAudio, type TranscribeResult } from './llm.js';

export interface Keyframe {
  /** Seconds into the source media (0 for a still photo). */
  timestampSec: number;
  jpeg: Buffer;
}

let cachedFfmpeg: string | null | undefined;

/** Resolve the ffmpeg binary once; null when neither path is available. */
export async function resolveFfmpeg(): Promise<string | null> {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;
  if (env.FFMPEG_PATH) {
    cachedFfmpeg = env.FFMPEG_PATH;
    return cachedFfmpeg;
  }
  try {
    const mod = (await import('ffmpeg-static')) as unknown as { default?: string };
    cachedFfmpeg = mod.default ?? null;
  } catch {
    cachedFfmpeg = null;
  }
  return cachedFfmpeg;
}

async function runFfmpeg(bin: string, args: string[], timeoutMs = 90_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8_000) stderr = stderr.slice(-4_000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpl-media-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function materialize(storageKey: string, dir: string): Promise<string> {
  const dest = path.join(dir, 'input.bin');
  await pipeline(await getStorage().getStream(storageKey), createWriteStream(dest));
  return dest;
}

/** Extract up to `count` frames (JPEG) from a video at ~1 fps. */
export async function extractKeyframes(storageKey: string, count = 4): Promise<Keyframe[]> {
  const bin = await resolveFfmpeg();
  if (!bin) return [];
  try {
    return await withTempDir(async (dir) => {
      const input = await materialize(storageKey, dir);
      const pattern = path.join(dir, 'frame-%02d.jpg');
      await runFfmpeg(bin, [
        '-y',
        '-i', input,
        '-vf', 'fps=1,scale=640:-2',
        '-frames:v', String(count),
        '-q:v', '4',
        pattern,
      ]);
      const frames: Keyframe[] = [];
      for (let i = 1; i <= count; i++) {
        const file = path.join(dir, `frame-${String(i).padStart(2, '0')}.jpg`);
        try {
          frames.push({ timestampSec: i - 1, jpeg: await readFile(file) });
        } catch {
          break; // no more frames produced (short clip)
        }
      }
      return frames;
    });
  } catch (err) {
    logger.warn({ err, storageKey }, 'keyframe extraction failed');
    return [];
  }
}

/** Read a still image straight from storage (no transcode). */
export async function readImage(storageKey: string): Promise<Buffer | null> {
  try {
    const stream = await getStorage().getStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } catch (err) {
    logger.warn({ err, storageKey }, 'image read failed');
    return null;
  }
}

/** Extract 16 kHz mono PCM → transcribe. Null when ffmpeg/ASR unavailable. */
export async function transcribeEvidence(
  storageKey: string,
  language?: string,
): Promise<TranscribeResult | null> {
  const bin = await resolveFfmpeg();
  if (!bin) return null;
  try {
    const wav = await withTempDir(async (dir) => {
      const input = await materialize(storageKey, dir);
      const out = path.join(dir, 'audio.wav');
      await runFfmpeg(bin, ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', out]);
      return readFile(out);
    });
    return await transcribeAudio(wav, 'audio.wav', language);
  } catch (err) {
    logger.warn({ err, storageKey }, 'audio transcription failed');
    return null;
  }
}
