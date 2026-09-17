// Local Express backend. Runs on http://localhost:8787, exposes:
//   GET  /api/posts        -> ranked roundup of hot drama posts
//   POST /api/generate     -> start a video job, returns { jobId }
//   GET  /api/status/:id   -> poll a job (status, progress, final videoUrl)
//   /output/<id>.mp4       -> finished videos (static)
//
// Nothing here binds to anything but localhost; this is a personal, on-machine
// tool, not a public server.

import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { fetchRoundup, loadRoundupFile, fetchPostText } from "./reddit.js";
import { synthesize, synthesizeSample } from "./tts.js";
import { renderVideo } from "./render.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");
const PUBLIC_DIR = path.join(ROOT, "public");
const AUDIO_DIR = path.join(PUBLIC_DIR, "audio");
const BANK_DIR = path.join(PUBLIC_DIR, "video-bank");
const SAMPLES_DIR = path.join(PUBLIC_DIR, "samples");
const DATA_DIR = path.join(ROOT, "data");

for (const d of [OUTPUT_DIR, PUBLIC_DIR, AUDIO_DIR, BANK_DIR, SAMPLES_DIR, DATA_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// Short line spoken in each voice preview.
const SAMPLE_TEXT = "Hey, this is what I sound like reading your Reddit drama.";

// Load .env (Reddit OAuth credentials) if present. Node 20.6+ built-in; no dep.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env — fine, unless the user picks the "live" source without configuring it.
}

// Your tracked drama subreddits (same spirit as the reddit-drama-roundup skill).
const DEFAULT_SUBS = [
  "AITAH",
  "AmITheDevil",
  "weddingshaming",
  "JUSTNOMIL",
  "EntitledPeople",
];

const app = express();
// Port is configurable via the PORT env var (the Windows service sets it to 80);
// defaults to 8787 for local dev.
const PORT = Number(process.env.PORT) || 8787;
// Sub-path the whole app is hosted under, e.g. http://localhost/redditdrama/.
// Must match `base` in vite.config.js. Use "" to host at the root.
const BASE_PATH = (process.env.BASE_PATH ?? "/redditdrama").replace(/\/$/, "");
// Remotion's headless browser fetches render assets (narration + background)
// from here over HTTP, so they're always current — never a stale bundle copy.
const ASSET_BASE = `http://127.0.0.1:${PORT}${BASE_PATH}/assets`;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/output", express.static(OUTPUT_DIR));
app.use("/assets", express.static(PUBLIC_DIR));

// Serve the built frontend (npm run build -> dist/) when present, so the whole
// app runs as ONE process — no separate Vite dev server needed in production.
// In dev you still use `npm run dev`; this only kicks in once dist/ exists.
const DIST_DIR = path.join(ROOT, "dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

app.get("/api/posts", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const source = req.query.source === "file" ? "file" : "live";

    if (source === "file") {
      const { posts, usedSample } = await loadRoundupFile(DATA_DIR, limit);
      return res.json({ source, posts, usedSample });
    }

    const subs = (
      req.query.subs ? String(req.query.subs).split(",") : DEFAULT_SUBS
    )
      .map((s) => s.trim())
      .filter(Boolean);
    const posts = await fetchRoundup(subs, limit);
    res.json({ source, subs, posts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Full text for one post, fetched live when a post is selected. Uses the Reddit
// OAuth API; if OAuth isn't configured it returns { selftext: null } (200) so
// the UI silently falls back to whatever text is already in the roundup file.
app.get("/api/post-text", async (req, res) => {
  const id = String(req.query.id || "");
  if (!/^[a-z0-9_]+$/i.test(id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }
  try {
    const selftext = await fetchPostText(id);
    res.json({ selftext });
  } catch (e) {
    res.json({ selftext: null, error: e.message });
  }
});

// Voice preview: returns a short mp3 spoken in the requested voice. Generated
// once per voice and cached on disk, so repeat plays are instant.
app.get("/api/voice-sample", async (req, res) => {
  try {
    const voice = String(req.query.voice || "").trim();
    // Whitelist the shape of a valid Edge voice id (e.g. en-US-GuyNeural) to
    // keep this away from arbitrary filenames / path traversal.
    if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(voice)) {
      return res.status(400).json({ error: "Invalid voice id" });
    }
    const file = path.join(SAMPLES_DIR, `${voice}.mp3`);
    if (!fs.existsSync(file)) {
      await synthesizeSample({ text: SAMPLE_TEXT, voice, outFile: file });
    }
    res.type("audio/mpeg");
    res.sendFile(file);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// In-memory job table. Fine for a single-user local tool; restarting the server
// clears it (finished .mp4s still live in /output).
const jobs = new Map();

app.post("/api/generate", async (req, res) => {
  const { post, voice, wordsPerGroup } = req.body || {};
  if (!post || !post.title) {
    return res.status(400).json({ error: "Missing post" });
  }
  const wpg = Math.max(1, Math.min(6, Number(wordsPerGroup) || 3));
  const jobId =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  jobs.set(jobId, { status: "starting", progress: 0 });
  res.json({ jobId });

  runJob(jobId, post, voice, wpg).catch((e) => {
    console.error(`Job ${jobId} failed:`, e);
    jobs.set(jobId, { status: "error", error: e.message });
  });
});

app.get("/api/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "No such job" });
  res.json(job);
});

async function runJob(jobId, post, voice, wordsPerGroup) {
  const set = (patch) => jobs.set(jobId, { ...jobs.get(jobId), ...patch });

  // 1. Build the narration script from title + body.
  const script = buildScript(post);

  // 2. Text -> speech + word timings.
  set({ status: "tts", progress: 0.05 });
  const { audioRelPath, words, durationSec } = await synthesize({
    text: script,
    voice: voice || "en-US-GuyNeural",
    audioDir: AUDIO_DIR,
    id: jobId,
  });

  // 3. Pick a random background clip.
  set({ status: "picking-bg", progress: 0.2 });
  const bg = pickBackground(BANK_DIR);
  if (!bg) {
    throw new Error(
      "No background clips found. Drop some .mp4 files into public/video-bank/."
    );
  }
  // Full HTTP URLs (encode each path segment; background filenames often have
  // spaces/parentheses).
  const audioSrc = `${ASSET_BASE}/${audioRelPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const bgSrc = `${ASSET_BASE}/video-bank/${encodeURIComponent(bg)}`;

  // 4. Render with Remotion.
  set({ status: "rendering", progress: 0.3 });
  const outName = `${jobId}.mp4`;
  await renderVideo({
    outputPath: path.join(OUTPUT_DIR, outName),
    inputProps: {
      audioSrc,
      bgSrc,
      words,
      title: post.title,
      durationSec,
      wordsPerGroup,
      titleWordCount: post.title.trim().split(/\s+/).filter(Boolean).length,
    },
    onProgress: (p) => set({ status: "rendering", progress: 0.3 + p * 0.7 }),
  });

  set({
    status: "done",
    progress: 1,
    videoUrl: `${BASE_PATH}/output/${outName}`,
    background: bg,
  });
}

function buildScript(post) {
  // Narrate the full title + body as provided by the client (the editable text
  // box), no truncation — the user controls length by editing the text.
  const body = (post.selftext || "").trim();
  return [post.title.trim(), body].filter(Boolean).join(". ");
}

function pickBackground(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f));
  if (!files.length) return null;
  return files[Math.floor(Math.random() * files.length)];
}

// SPA fallback: any non-API GET returns the built index.html (harmless in dev
// where dist/ doesn't exist — it just falls through to a 404).
app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/output") ||
    req.path.startsWith("/assets")
  ) {
    return next();
  }
  const index = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

// Mount the whole app under BASE_PATH (e.g. /redditdrama) and redirect the bare
// root to it, so the app lives at http://localhost/redditdrama/.
const root = express();
if (BASE_PATH) {
  root.get("/", (req, res) => res.redirect(`${BASE_PATH}/`));
  root.use(BASE_PATH, app);
} else {
  root.use(app);
}

root.listen(PORT, () =>
  console.log(
    `Reddit Drama Video server -> http://localhost:${PORT}${BASE_PATH}/`
  )
);
