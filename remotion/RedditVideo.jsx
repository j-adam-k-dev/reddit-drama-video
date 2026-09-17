import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

// Font size shrinks as the on-screen group grows, so a 10-word body group or a
// long title still fits nicely.
function fontSizeFor(n) {
  if (n <= 3) return 112;
  if (n <= 5) return 92;
  if (n <= 8) return 74;
  if (n <= 11) return 60;
  if (n <= 15) return 50;
  return 42;
}

// The video: muted background clip, narration audio, and centered captions.
// The FULL TITLE shows as one block while it's narrated (it's the first
// `titleWordCount` words), then the body shows `wordsPerGroup` words at a time
// with the spoken word highlighted.
export const RedditVideo = ({
  audioSrc,
  bgSrc,
  words = [],
  wordsPerGroup = 10,
  titleWordCount = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const groups = useMemo(() => {
    const n = Math.max(1, Math.min(12, Math.round(wordsPerGroup)));
    const tc = Math.min(Math.max(0, Math.round(titleWordCount)), words.length);
    const g = [];
    if (tc > 0) g.push(words.slice(0, tc)); // whole title = one group
    for (let i = tc; i < words.length; i += n) g.push(words.slice(i, i + n));
    return g;
  }, [words, wordsPerGroup, titleWordCount]);

  // Show the latest group whose start time we've reached; it persists through
  // any silent gap until the next group begins (no flicker).
  let idx = -1;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length && ms >= groups[i][0].startMs) idx = i;
    else break;
  }
  const group = idx >= 0 ? groups[idx] : null;

  let scale = 1;
  if (group) {
    const startFrame = (group[0].startMs / 1000) * fps;
    const enter = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 13, stiffness: 190, mass: 0.5 },
    });
    scale = 0.85 + enter * 0.15;
  }

  const fontSize = group ? fontSizeFor(group.length) : 100;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {bgSrc ? (
        <OffthreadVideo
          src={bgSrc}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}

      {audioSrc ? <Audio src={audioSrc} /> : null}

      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", padding: 70 }}
      >
        {group ? (
          <div
            style={{
              transform: `scale(${scale})`,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.28em",
              maxWidth: "92%",
              fontFamily: "Arial Black, Arial, sans-serif",
              fontWeight: 900,
              fontSize,
              lineHeight: 1.08,
              textTransform: "uppercase",
              textAlign: "center",
              WebkitTextStroke: `${Math.round(fontSize / 11)}px black`,
              paintOrder: "stroke fill",
              textShadow: "0 10px 30px rgba(0,0,0,0.65)",
            }}
          >
            {group.map((w, i) => {
              const active = ms >= w.startMs && ms < w.endMs;
              return (
                <span
                  key={i}
                  style={{
                    color: active ? "#ffe000" : "white",
                    transform: active ? "scale(1.06)" : "none",
                    display: "inline-block",
                  }}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
