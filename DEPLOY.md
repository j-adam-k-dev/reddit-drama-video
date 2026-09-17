# Running as a Windows service (always-on localhost)

This runs the whole app as **one auto-starting Windows service** — no IIS, no Vite
dev server. The Node/Express process serves both the built UI and the API on
**port 80** under the **`/redditdrama`** sub-path, so it lives at
**http://localhost/redditdrama/** (and http://localhost/ redirects there). It
restarts itself on every boot.

> **Changing the sub-path:** it's set in two places that must match —
> `base` in `vite.config.js` and `BASE_PATH` in `server/index.js` (set it to `""`
> to host at the root). After changing, re-run `npm run build` and restart the
> service.

> Why not IIS? IIS can't run Node/Remotion — it can only reverse-proxy to a Node
> process that's already running as a service. Since the service below already
> serves everything on port 80, IIS would add nothing here. (If you ever *do* want
> IIS in front — for SSL, host headers, or sharing port 80 with other sites — say so
> and I'll add the `web.config` reverse-proxy.)

## One-time setup

1. **Build the UI** (also re-run this any time you change front-end code):
   ```bash
   npm run build
   ```
   This produces `dist/`, which the server serves automatically when present.

2. *(Optional)* Drop background clips into `public\video-bank\` and add Reddit
   OAuth to `.env` (see `README.md`). These are read live — no rebuild needed.

3. **Open an Administrator terminal** — right-click PowerShell or Command Prompt →
   **Run as administrator** (installing a Windows service requires elevation).

4. Go to the project and install the service:
   ```bash
   cd C:\Code\reddit-drama-video
   node service\install-service.cjs
   ```
   It installs, starts, and prints `http://localhost:80/`.

5. Open **http://localhost/redditdrama/** — done. It'll come back on its own
   after a reboot.

## Managing the service

The service is named **RedditDramaVideo** (visible in `services.msc`).

| Action | Command (run elevated) |
| --- | --- |
| Stop | `net stop RedditDramaVideo` |
| Start | `net start RedditDramaVideo` |
| Uninstall | `node service\uninstall-service.cjs` |
| Logs | see `service\daemon\*.out.log` and `*.err.log` |

- **Front-end changes:** re-run `npm run build` — the running service serves the
  new files immediately (no restart needed).
- **Back-end / Remotion changes** (`server\*`, `remotion\*`): restart the service
  — `net stop RedditDramaVideo && net start RedditDramaVideo`.

## Options & gotchas

- **Different port:** it defaults to 80. To use another, uninstall, then:
  ```bash
  set SERVICE_PORT=8080
  node service\install-service.cjs
  ```
  (app is then at `http://localhost:8080/`).
- **Renders fail only under the service?** The service runs as *LocalSystem*
  (session 0). Remotion's headless Chromium normally works there, but if a render
  fails under the service yet works under `npm run dev`, open `services.msc` →
  **RedditDramaVideo** → **Log On** tab → **This account**, enter your Windows
  login, and restart the service so Chromium runs in your user session.
- **`npm` blocked in the elevated shell?** Same PowerShell execution-policy issue
  as before — call `node service\install-service.cjs` directly (as shown), which
  sidesteps it.
