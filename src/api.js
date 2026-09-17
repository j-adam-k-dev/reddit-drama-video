// Thin wrapper over the local backend API. All requests are same-origin thanks
// to the Vite dev proxy (see vite.config.js).

// The app is served under a sub-path (e.g. /redditdrama/); Vite injects it as
// BASE_URL so API calls resolve correctly whether hosted at root or a sub-path.
const BASE = import.meta.env.BASE_URL; // e.g. "/redditdrama/"

async function json(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchPosts({ subs, limit = 25, source = "live" }) {
  const params = new URLSearchParams();
  if (subs) params.set("subs", subs);
  params.set("limit", String(limit));
  params.set("source", source);
  return json(await fetch(`${BASE}api/posts?${params}`));
}

export async function startGenerate(post, voice, wordsPerGroup) {
  return json(
    await fetch(`${BASE}api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post, voice, wordsPerGroup }),
    })
  );
}

export async function getStatus(jobId) {
  return json(await fetch(`${BASE}api/status/${jobId}`));
}
