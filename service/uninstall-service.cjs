// Stops and removes the Windows service. Run from an ELEVATED terminal:
//
//   node service\uninstall-service.cjs

const path = require("path");
const { Service } = require("node-windows");

const ROOT = path.join(__dirname, "..");

const svc = new Service({
  name: "RedditDramaVideo",
  script: path.join(ROOT, "server", "index.js"),
});

svc.on("uninstall", () => {
  console.log("Service uninstalled.");
  console.log("Still installed?", svc.exists);
});
svc.on("stop", () => console.log("Service stopped."));
svc.on("error", (e) => console.error("Service error:", e));

console.log('Removing "RedditDramaVideo" service… this needs Administrator rights.');
svc.uninstall();
