import React from "react";
import { Composition } from "remotion";
import { RedditVideo } from "./RedditVideo.jsx";

const FPS = 30;

// A single 9:16 composition. The duration is computed per-render from the
// narration length (durationSec passed in inputProps), so each video is exactly
// as long as its audio.
export const RemotionRoot = () => {
  return (
    <Composition
      id="RedditVideo"
      component={RedditVideo}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{
        audioSrc: "",
        bgSrc: "",
        words: [],
        title: "",
        durationSec: 10,
        wordsPerGroup: 10,
        titleWordCount: 0,
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.ceil((props.durationSec || 10) * FPS)),
      })}
    />
  );
};
