// Text -> narration audio using Microsoft Edge's free neural voices, via
// edge-tts-universal (a maintained port that implements Microsoft's required
// Sec-MS-GEC security token — the older msedge-tts package fails to connect
// without it).
//
// The key win: the stream yields WordBoundary events, so we get exact per-word
// timestamps for FREE and never need a separate forced aligner (Whisper) to
// sync captions. Offsets/durations arrive in 100-nanosecond "ticks".

import fs from "node:fs";
import path from "node:path";
import { Communicate } from "edge-tts-universal";

const TICKS_PER_MS = 10000;

export async function synthesize({ text, voice, audioDir, id }) {
  const communicate = new Communicate(text, { voice });

  const audioFile = path.join(audioDir, `${id}.mp3`);
  const audioChunks = [];
  const words = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      audioChunks.push(Buffer.from(chunk.data));
    } else if (chunk.type === "WordBoundary") {
      const startMs = chunk.offset / TICKS_PER_MS;
      words.push({
        word: chunk.text,
        startMs,
        endMs: startMs + chunk.duration / TICKS_PER_MS,
      });
    }
  }

  if (!audioChunks.length) {
    throw new Error("No audio received from the TTS service.");
  }
  fs.writeFileSync(audioFile, Buffer.concat(audioChunks));

  words.sort((a, b) => a.startMs - b.startMs);

  let durationSec;
  if (words.length) {
    durationSec = (words[words.length - 1].endMs + 500) / 1000; // small tail
  } else {
    // Fallback if boundaries ever fail to arrive: estimate by word length.
    durationSec = Math.max(3, text.replace(/\s+/g, "").length / 14);
    words.push(...estimateWords(text, durationSec));
  }

  return {
    audioRelPath: path.posix.join("audio", `${id}.mp3`),
    words,
    durationSec,
  };
}

// Lightweight synth for voice previews: audio only, no word timings, written
// straight to `outFile`. Used by the /api/voice-sample endpoint.
export async function synthesizeSample({ text, voice, outFile }) {
  const communicate = new Communicate(text, { voice });
  const chunks = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) chunks.push(Buffer.from(chunk.data));
  }
  if (!chunks.length) throw new Error("No audio received from the TTS service.");
  fs.writeFileSync(outFile, Buffer.concat(chunks));
  return outFile;
}

function estimateWords(text, durationSec) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((n, w) => n + w.length, 0) || 1;
  let t = 0;
  return tokens.map((w) => {
    const share = (w.length / totalChars) * durationSec * 1000;
    const startMs = t;
    t += share;
    return { word: w, startMs, endMs: t };
  });
}
