import React, { useEffect, useRef, useState } from "react";
import { fetchPosts, startGenerate, getStatus } from "./api.js";

const VOICES = [
  { id: "en-US-GuyNeural", label: "Guy — US male" },
  { id: "en-US-ChristopherNeural", label: "Christopher — US male" },
  { id: "en-US-EricNeural", label: "Eric — US male" },
  { id: "en-US-JennyNeural", label: "Jenny — US female" },
  { id: "en-US-AriaNeural", label: "Aria — US female" },
  { id: "en-GB-RyanNeural", label: "Ryan — UK male" },
];

const DEFAULT_SUBS =
  "AITAH,AmITheDevil,weddingshaming,JUSTNOMIL,EntitledPeople";

const STATUS_LABELS = {
  starting: "Starting…",
  tts: "Generating narration…",
  "picking-bg": "Picking background…",
  rendering: "Rendering video…",
  done: "Done!",
  error: "Error",
};

export default function App() {
  const [subs, setSubs] = useState(DEFAULT_SUBS);
  const [source, setSource] = useState("file");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [scriptText, setScriptText] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [wordsPerGroup, setWordsPerGroup] = useState(10);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);
  const sampleRef = useRef(null);
  const selectedIdRef = useRef(null);

  // Select a post: prefill the script box immediately from the roundup, then try
  // to pull the post's full current text (works when Reddit OAuth is configured;
  // otherwise the endpoint returns null and we keep the roundup text).
  function selectPost(p) {
    setSelected(p);
    setJob(null);
    setScriptText(p.selftext || "");
    selectedIdRef.current = p.id;
    fetch(`${import.meta.env.BASE_URL}api/post-text?id=${encodeURIComponent(p.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.selftext && selectedIdRef.current === p.id) {
          setScriptText(d.selftext);
        }
      })
      .catch(() => {});
  }

  function playVoiceSample(v) {
    if (!sampleRef.current) sampleRef.current = new Audio();
    const a = sampleRef.current;
    try {
      a.pause();
    } catch {}
    a.src = `${import.meta.env.BASE_URL}api/voice-sample?voice=${encodeURIComponent(v)}`;
    a.play().catch(() => {});
  }

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    setSelected(null);
    setJob(null);
    try {
      const data = await fetchPosts({ subs, limit: 25, source });
      setPosts(data.posts);
      if (data.usedSample) {
        setNotice(
          "Showing bundled sample posts (no data/roundup.json found yet)."
        );
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!selected) return;
    setJob({ status: "starting", progress: 0 });
    try {
      const postForGen = { ...selected, selftext: scriptText };
      const { jobId } = await startGenerate(postForGen, voice, wordsPerGroup);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const s = await getStatus(jobId);
          setJob(s);
          if (s.status === "done" || s.status === "error") {
            clearInterval(pollRef.current);
          }
        } catch (e) {
          setJob({ status: "error", error: e.message });
          clearInterval(pollRef.current);
        }
      }, 1000);
    } catch (e) {
      setJob({ status: "error", error: e.message });
    }
  }

  const busy = job && job.status !== "done" && job.status !== "error";

  return (
    <div className="app">
      <header className="topbar">
        <h1>🎬 Reddit Drama Video Studio</h1>
        <div className="subs-row">
          <select
            className="source-select"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            title="Where to get posts from"
          >
            <option value="live">Live (Reddit OAuth)</option>
            <option value="file">From file (skill roundup)</option>
          </select>
          <input
            className="subs-input"
            value={subs}
            onChange={(e) => setSubs(e.target.value)}
            placeholder="comma-separated subreddits"
            disabled={source === "file"}
          />
          <button onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh roundup"}
          </button>
        </div>
      </header>

      {error ? <div className="banner error">⚠ {error}</div> : null}
      {notice ? <div className="banner notice">ℹ {notice}</div> : null}

      <div className="columns">
        <section className="list">
          {posts.length === 0 && !loading ? (
            <p className="muted">No posts. Try Refresh.</p>
          ) : null}
          {posts.map((p, i) => (
            <button
              key={p.id}
              className={`card ${selected?.id === p.id ? "selected" : ""}`}
              onClick={() => selectPost(p)}
            >
              <div className="card-rank">#{i + 1}</div>
              <div className="card-main">
                <div className="card-title">{p.title}</div>
                <div className="card-meta">
                  r/{p.subreddit} · ▲ {p.score.toLocaleString()} · 💬{" "}
                  {p.numComments.toLocaleString()}
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="detail">
          {!selected ? (
            <p className="muted">Select a post to preview and generate.</p>
          ) : (
            <>
              <h2>{selected.title}</h2>
              <div className="card-meta">
                r/{selected.subreddit} · u/{selected.author} · ▲{" "}
                {selected.score.toLocaleString()} · 💬 {selected.numComments}
                {"  "}
                <a href={selected.permalink} target="_blank" rel="noreferrer">
                  open on reddit ↗
                </a>
              </div>

              <label className="script-label">
                Narration script — edit or paste the full post; this exact text
                is what gets spoken.
              </label>
              <textarea
                className="body-edit"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                spellCheck={false}
              />
              <div className="script-meta">{scriptText.length} characters</div>

              <div className="controls">
                <label>
                  Voice&nbsp;
                  <select
                    value={voice}
                    onChange={(e) => {
                      setVoice(e.target.value);
                      playVoiceSample(e.target.value);
                    }}
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="preview-btn"
                  onClick={() => playVoiceSample(voice)}
                  title="Preview this voice"
                >
                  🔊 Preview
                </button>
                <label>
                  Words on screen&nbsp;
                  <select
                    value={wordsPerGroup}
                    onChange={(e) => setWordsPerGroup(Number(e.target.value))}
                    title="How many words show at once"
                  >
                    <option value={1}>1 (one at a time)</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                    <option value={10}>10</option>
                  </select>
                </label>
                <button
                  className="primary"
                  onClick={generate}
                  disabled={busy || !scriptText.trim()}
                >
                  {busy ? "Working…" : "Generate video"}
                </button>
              </div>

              {job ? (
                <div className="job">
                  <div className="job-status">
                    {STATUS_LABELS[job.status] || job.status}
                    {job.error ? ` — ${job.error}` : ""}
                  </div>
                  {busy ? (
                    <div className="progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  {job.status === "done" && job.videoUrl ? (
                    <div className="result">
                      <video src={job.videoUrl} controls />
                      <a href={job.videoUrl} download>
                        ⬇ Download .mp4
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
