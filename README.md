# Reddit Drama Video Studio

A **local, on-your-machine** app that:

1. Pulls a popularity-ranked roundup of hot posts from your "drama" subreddits
   (AITAH, AmITheDevil, weddingshaming, JUSTNOMIL, EntitledPeople — editable).
2. Shows them in a clickable list.
3. Lets you pick one and generate a vertical (9:16) video in the classic
   Reddit-story-short style: **free neural TTS narration**, a **random muted
   background clip** from your own video bank, and **big word-by-word captions**
   that pop in perfectly synced to the voice.

Nothing is exposed to the internet — the backend binds to `localhost` only.

---

## How the pieces fit

```
Browser (React UI, :5173)
        │  /api/*  (Vite proxies to :8787)
        ▼
Express backend (:8787)
  ├─ reddit.js   OAuth fetch + rank hot posts  (or load a skill-made JSON file)
  ├─ tts.js      edge-tts → narration.mp3 + per-word timestamps (free!)
  └─ render.js   Remotion → burns synced captions over the bg clip → output/*.mp4
```

**Two data sources** (toggle in the UI):

- **Live (Reddit OAuth)** — the standalone path. Reddit blocks unauthenticated
  requests (403), so the app authenticates with your own free "script" app
  credentials. Set up once (below) and it fetches automatically forever.
- **From file** — reads `data/roundup.json` produced by the
  `/reddit-drama-roundup` skill (driven through your logged-in Chrome). Ships
  with `data/roundup.sample.json` so this mode works immediately for testing.

**Why word-by-word sync is free:** edge-tts emits *WordBoundary* events, so we
get exact per-word timings without running a separate forced aligner like
Whisper. Those timings drive the caption pop in `remotion/RedditVideo.jsx`.

**Why there's a backend at all:** a browser can't run a video renderer, write
files, or fetch reddit without CORS issues. The React app is the UI; the Node
server does the heavy lifting.

---

## Prerequisites

- **Node.js 20 LTS or newer** (you don't currently have Node installed).
  Install from <https://nodejs.org/> (the "LTS" installer), then reopen your
  terminal and confirm:

  ```bash
  node --version
  npm --version
  ```

- On first render, Remotion downloads a headless Chromium (~150 MB) and bundles
  its own ffmpeg — no separate install needed.

## Setup

```bash
cd C:\Code\reddit-drama-video
npm install
```

## Reddit access setup (for the "Live" source)

Reddit blocks unauthenticated API access, so create a free personal app:

1. Go to <https://www.reddit.com/prefs/apps> (logged in).
2. Click **create another app…**, choose type **script**.
3. Give it any name; set redirect uri to `http://localhost:8787` (required but
   unused). Create it.
4. The short string under the app name is your **client ID**; the **secret** is
   shown next to "secret".
5. Copy `.env.example` to `.env` and paste both values in.

```bash
copy .env.example .env      # then edit .env
```

You never share these with anyone; they stay in your local `.env` (gitignored).
If you skip this, just use the **From file** source instead.

## Add background clips

Drop a few long gameplay-style `.mp4` files (Minecraft parkour, Subway Surfers,
satisfying loops — the usual) into:

```
public/video-bank/
```

Each clip should be **at least as long as your narration** (~1–2 minutes is
plenty; the app trims the background to the audio length but does not loop it).
The app picks one at random per video.

> Use clips you have the rights to use.

## Run

```bash
npm run dev
```

Then open <http://localhost:5173>.

- Edit the subreddit list at the top, hit **Refresh roundup**.
- Click a post, pick a **voice**, hit **Generate video**.
- Watch the progress bar; the finished video appears inline with a download
  link. Files also land in `output/`.

---

## Customizing

| Want to change… | Edit |
| --- | --- |
| Default subreddits | `DEFAULT_SUBS` in `server/index.js` |
| Ranking formula | `all.sort(...)` in `server/reddit.js` |
| Narration length cap | `MAX_SCRIPT_CHARS` in `server/index.js` |
| Caption look (font, size, stroke, animation) | `remotion/RedditVideo.jsx` |
| Voices in the dropdown | `VOICES` in `src/App.jsx` |
| Resolution / fps | `Composition` props in `remotion/Root.jsx` |

### Preview the video design live

You can open Remotion Studio to tweak the composition visually:

```bash
npm run remotion:studio
```

---

## Troubleshooting

- **"No background clips found"** — add `.mp4`s to `public/video-bank/`.
- **Reddit returns HTTP 429** — you're being rate-limited; wait a bit, or reduce
  how often you refresh. The request already sends a descriptive User-Agent.
- **Captions look out of sync / empty** — narration uses `edge-tts-universal`,
  which reads Microsoft's free Edge voices over a WebSocket and returns per-word
  timings. If Microsoft ever changes the endpoint token, update that package
  (`npm update edge-tts-universal`). `server/tts.js` falls back to estimated
  timings if no word boundaries arrive.
- **`Connect Error` from TTS** — the Edge voice endpoint was unreachable
  (network/firewall) or the security token is stale; retry, and update
  `edge-tts-universal` if it persists.
- **Remotion version mismatch error** — every `remotion` / `@remotion/*` package
  must be the same version. Run `npx remotion versions` and align them.

## Notes / ideas for later

- Full-sentence caption context (dim the line, highlight the active word).
- Auto-generate a title card / opening hook.
- ElevenLabs voice option (swap `tts.js`, add Whisper for timings).
- Batch mode: generate videos for the top N posts at once.
