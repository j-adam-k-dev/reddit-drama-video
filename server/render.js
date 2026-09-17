// Renders the final vertical video by bundling the Remotion project and calling
// the headless renderer. The bundle is built once and reused across jobs.
//
// Note on assets: Remotion serves files from `publicDir`, and the composition
// references them with staticFile(). We point publicDir at ./public, which holds
// both the generated narration (public/audio/*.mp3) and the background clips
// (public/video-bank/*.mp4), so both resolve during render.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "remotion", "index.js");

let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    // No publicDir: assets (audio + background clips) are served by the Express
    // backend over HTTP and referenced by full URL in inputProps, so we never
    // snapshot them into the bundle (which broke later renders and would copy
    // the whole video bank each time).
    bundlePromise = bundle({
      entryPoint: ENTRY,
      onProgress: () => {},
    });
  }
  return bundlePromise;
}

export async function renderVideo({ outputPath, inputProps, onProgress }) {
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: "RedditVideo",
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  return outputPath;
}
