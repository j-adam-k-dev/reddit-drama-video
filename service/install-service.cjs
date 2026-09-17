// Installs the app as an auto-starting Windows service using node-windows.
// MUST be run from an ELEVATED (Administrator) terminal:
//
//   node service\install-service.cjs
//
// The service runs `server/index.js` with PORT=80, so the app is reachable at
// http://localhost/ after it starts (and again automatically after every reboot).
// Set a different port with:  set SERVICE_PORT=8080 && node service\install-service.cjs

const path = require("path");
const { Service } = require("node-windows");

const PORT = process.env.SERVICE_PORT || "80";
const ROOT = path.join(__dirname, "..");

const svc = new Service({
  name: "RedditDramaVideo",
  description: "Reddit Drama Video Studio — Node/Express + Remotion renderer.",
  script: path.join(ROOT, "server", "index.js"),
  workingDirectory: ROOT,
  // Restart on crash rather than giving up.
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
  env: [
    { name: "PORT", value: String(PORT) },
    { name: "NODE_ENV", value: "production" },
  ],
});

svc.on("install", () => {
  console.log("Service installed. Starting…");
  svc.start();
});
svc.on("alreadyinstalled", () => {
  console.log(
    "Service already installed. Uninstall first (node service\\uninstall-service.cjs) to reinstall."
  );
});
svc.on("start", () => {
  console.log(`Service started -> http://localhost:${PORT}/`);
  console.log("It will now start automatically on every boot.");
});
svc.on("error", (e) => console.error("Service error:", e));

console.log(
  `Installing "RedditDramaVideo" service (port ${PORT})… this needs Administrator rights.`
);
svc.install();
