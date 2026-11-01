# Operational troubleshooting

Start with:

```bash
curl -s http://127.0.0.1:3000/api/health
```

```bash
journalctl -u fitflow-web -u fitflow-worker --since "1 hour ago"
```

The health endpoint reports `db` and `worker` status (worker heartbeat older than 60 s means "stale"). In the app, **Settings → AI status** shows the Codex diagnostics and recent generation outcomes (prompts are never shown).

| Symptom | Likely cause | Fix |
|---|---|---|
| Plan generation fails with "Codex is not authenticated" | Codex isn't logged in **for the `fitflow` user**, or the token expired | Run `sudo -u fitflow -H codex login`, check with `sudo -u fitflow -H codex login status`, then press "Retry" on the job |
| Job stays "queued" with a retry time | Temporary Codex usage limit | Nothing to do: it retries automatically (about 20 min). The current plan is unaffected |
| Job fails with "AI output was not valid" | The model returned JSON that failed schema/business validation twice | Retry. Details are in `ai_generation_metadata.validation_errors` (`sqlite3 fitflow.db "select outcome,validation_errors from ai_generation_metadata order by created_at desc limit 5"`) |
| Job fails with timeout | Slow model or a large request | Raise `AI_JOB_TIMEOUT_MS`, retry |
| "Codex CLI not found" | `CODEX_BIN` is wrong for the service environment | Check `sudo -u fitflow -H which codex` and set an absolute `CODEX_BIN` |
| Codex network errors ("Reconnecting…") | Outbound HTTPS to the model provider is blocked | Allow egress from the VPS; check proxy variables in the env file |
| Worker "stale" in /api/health | Worker crashed or stopped | `systemctl status fitflow-worker`. Jobs left "running" are re-queued automatically on restart |
| PDF fails | Chromium is missing or system libraries are missing | `pnpm exec playwright install-deps chromium && sudo -u fitflow -H pnpm exec playwright install chromium`, or set `CHROMIUM_PATH` |
| Login always returns to /login | `APP_URL` is `https://` but the site is served over http, so the cookie is Secure | Serve via HTTPS (Nginx) or fix `APP_URL` |
| 403 "invalid origin" on writes | Reverse proxy doesn't forward `Host`/`X-Forwarded-Host` | Use `deploy/nginx/fitflow-proxy.conf`; make `APP_URL` match the public URL |
| `SQLITE_BUSY` errors | Long external process holding the DB | WAL plus a 5 s busy timeout are configured; avoid opening the DB with write locks while services run. Use `pnpm backup`, not a raw file copy |
| Offline entries not syncing | The device is still offline, or an entry conflicted | The header badge shows pending entries. Conflicting set edits keep the newer server copy; entries without their parent workout retry later |
| Push notifications don't arrive | VAPID not configured, or permission denied | `pnpm vapid:generate`, set the env vars, restart; re-enable in Settings |
| Forgot password | — | `pnpm user:reset-password <email>` on the server (see DEPLOYMENT.md) |
| Restore needed | Corruption or a mistake | See DEPLOYMENT.md §7 (verify first, then `--yes`) |

Data locations: database at `DATABASE_PATH`; private photos and PDFs under `STORAGE_DIR/{photos,reports}/<userId>/`; Codex temp dirs under `CODEX_WORKDIR`, which are deleted after each job.
