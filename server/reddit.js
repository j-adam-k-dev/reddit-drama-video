// Two ways to get a popularity-ranked roundup of hot "drama" posts:
//
//   1. LIVE (OAuth)  — the app authenticates to Reddit with your own free
//      "script" app credentials and reads the official API. Reddit blocks
//      unauthenticated JSON access (403), so this is the reliable standalone
//      path. Requires REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (see README).
//
//   2. FILE          — read a data/roundup.json produced by the
//      /reddit-drama-roundup skill (driven through your logged-in Chrome).
//      No credentials needed; refresh it whenever you want new posts.
//
// Both return the same normalized post shape so the rest of the app doesn't care
// where the data came from.

import fs from "node:fs/promises";
import path from "node:path";

// Reddit asks for a unique, descriptive User-Agent: <platform>:<id>:<version>.
const UA = "windows:reddit-drama-video:v0.1 (personal local app)";

// ---------------------------------------------------------------------------
// LIVE via OAuth (application-only / client-credentials grant)
// ---------------------------------------------------------------------------

let tokenCache = { token: null, exp: 0 };

async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Reddit OAuth not configured. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to a .env file (see README), or switch the source to 'From file'."
    );
  }
  // Reuse the token until ~30s before it expires.
  if (tokenCache.token && Date.now() < tokenCache.exp - 30000) {
    return tokenCache.token;
  }

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    throw new Error(
      `Reddit auth failed (HTTP ${res.status}). Double-check your client ID/secret and that the app type is "script".`
    );
  }
  const json = await res.json();
  tokenCache = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

export async function fetchRoundup(subs, limit) {
  const token = await getToken();
  const all = [];
  const failures = [];

  for (const sub of subs) {
    try {
      all.push(...(await fetchSub(sub, token)));
    } catch (e) {
      failures.push(`r/${sub}: ${e.message}`);
    }
  }

  rankByPopularity(all);

  if (!all.length && failures.length) {
    throw new Error(`Could not fetch any subreddit. ${failures.join("; ")}`);
  }
  return all.slice(0, limit);
}

async function fetchSub(sub, token) {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(
    sub
  )}/hot?limit=25&raw_json=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const children = json?.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter(
      (d) =>
        d && !d.stickied && d.is_self && (d.selftext || "").trim().length > 40
    )
    .map(normalizePost);
}

// Full self-text for a single post, by its id (e.g. "1wde1ub"). Needs OAuth.
export async function fetchPostText(id) {
  const token = await getToken(); // throws a clear message if OAuth isn't set
  const url = `https://oauth.reddit.com/comments/${encodeURIComponent(
    id
  )}?limit=1&raw_json=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const d = json?.[0]?.data?.children?.[0]?.data;
  if (!d) throw new Error("Post not found");
  return cleanBody(d.selftext);
}

// ---------------------------------------------------------------------------
// FILE (skill-produced roundup)
// ---------------------------------------------------------------------------

export async function loadRoundupFile(dataDir, limit) {
  const primary = path.join(dataDir, "roundup.json");
  const sample = path.join(dataDir, "roundup.sample.json");

  let raw;
  let usedSample = false;
  try {
    raw = await fs.readFile(primary, "utf8");
  } catch {
    // Fall back to the bundled sample so "From file" works out of the box.
    raw = await fs.readFile(sample, "utf8");
    usedSample = true;
  }

  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data.posts || [];
  const posts = list.map(normalizeLoosePost);
  rankByPopularity(posts);
  return { posts: posts.slice(0, limit), usedSample };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function rankByPopularity(posts) {
  // Upvotes are primary; comment volume is a secondary "drama" boost.
  posts.sort(
    (a, b) => b.score + b.numComments * 0.5 - (a.score + a.numComments * 0.5)
  );
}

// Shape a raw Reddit API post.
function normalizePost(d) {
  return {
    id: d.id,
    subreddit: d.subreddit,
    title: d.title,
    selftext: cleanBody(d.selftext),
    author: d.author,
    score: d.score ?? 0,
    numComments: d.num_comments ?? 0,
    permalink: `https://www.reddit.com${d.permalink}`,
    created: d.created_utc,
  };
}

// Shape a post from a file, tolerating either our field names or Reddit's.
function normalizeLoosePost(d, i) {
  return {
    id: d.id || `file-${i}`,
    subreddit: d.subreddit || "unknown",
    title: d.title || "(untitled)",
    selftext: cleanBody(d.selftext ?? d.body ?? d.text ?? ""),
    author: d.author || "unknown",
    score: d.score ?? d.ups ?? 0,
    numComments: d.numComments ?? d.num_comments ?? d.comments ?? 0,
    permalink: d.permalink || d.url || "",
    created: d.created ?? d.created_utc,
  };
}

// Strip Reddit markdown / links / quote blocks so text reads cleanly aloud.
function cleanBody(text) {
  return (text || "")
    .replace(/\r/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^&gt;.*$/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
