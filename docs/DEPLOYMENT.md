# Deployment guide (Linux VPS)

This guide uses placeholders: replace `fitflow.example.invalid` with your domain. No host, domain or credential is assumed.
Tested layout: Debian/Ubuntu, Node.js 22 LTS, Nginx, systemd.

## 1. System packages and service user

```bash
sudo apt-get update && sudo apt-get install -y nginx git curl ca-certificates sqlite3
```

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs && sudo corepack enable
```

```bash
sudo useradd --system --home /var/lib/fitflow --create-home --shell /usr/sbin/nologin fitflow
```

```bash
sudo mkdir -p /opt/fitflow /etc/fitflow /var/backups/fitflow /var/lib/fitflow/storage /var/lib/fitflow/codex-work && sudo chown -R fitflow:fitflow /opt/fitflow /var/lib/fitflow /var/backups/fitflow && sudo chmod 700 /var/lib/fitflow/codex-work
```

## 2. Application

```bash
sudo -u fitflow -H git clone <your-repo-url> /opt/fitflow/app
```

```bash
cd /opt/fitflow/app && sudo -u fitflow -H pnpm install --frozen-lockfile
```

Chromium is used for PDFs. Install it together with its system libraries:

```bash
cd /opt/fitflow/app && sudo pnpm exec playwright install-deps chromium && sudo -u fitflow -H pnpm exec playwright install chromium
```

Configuration:

```bash
sudo cp /opt/fitflow/app/.env.example /etc/fitflow/fitflow.env && sudo chown root:fitflow /etc/fitflow/fitflow.env && sudo chmod 640 /etc/fitflow/fitflow.env
```

Edit `/etc/fitflow/fitflow.env`: set `APP_URL=https://your.domain`, `PORT=3000`, and the paths, `CODEX_BIN` and `MIGRATIONS_DIR=/opt/fitflow/app/drizzle`. Then build and migrate:

```bash
cd /opt/fitflow/app && sudo -u fitflow -H bash -c 'set -a; . /etc/fitflow/fitflow.env; set +a; pnpm build && node dist/migrate.mjs'
```

## 3. Codex CLI (AI engine)

FitFlow invokes `codex exec` non-interactively **as the `fitflow` OS user**. Codex must therefore be authenticated for that user, not only for your personal login.

Install the CLI system-wide if it isn't installed yet:

```bash
sudo npm install -g @openai/codex
```

Then authenticate it for the worker user.

**Option A: sign in with your ChatGPT account (device flow).**

```bash
sudo -u fitflow -H codex login
```

**Option B: use an API key, piped via stdin so it never appears in the shell history.**

```bash
printenv OPENAI_API_KEY | sudo -u fitflow -H codex login --with-api-key
```

Verify the login:

```bash
sudo -u fitflow -H codex login status
```

```bash
cd /opt/fitflow/app && sudo -u fitflow -H bash -c 'set -a; . /etc/fitflow/fitflow.env; set +a; npx tsx scripts/ai-check.ts --smoke'
```

If Codex is already authenticated under **another** account, do not copy credential files into the app directory. Either log in again as `fitflow` (above), or point `CODEX_HOME` at a directory readable only by `fitflow`, e.g. `/var/lib/fitflow/.codex` with mode 0700. Credentials never live under `/opt/fitflow/app` or `public/`.

How FitFlow calls Codex: `codex exec --sandbox read-only --ephemeral --skip-git-repo-check --json --output-schema <schema> --output-last-message <file> -C <private job dir> -`, spawned with `shell:false`. The prompt is sent via stdin and every output is re-validated. The in-app page **Settings → AI status** shows the same diagnostics and can run a smoke test.

## 4. systemd

```bash
sudo cp /opt/fitflow/app/deploy/systemd/fitflow-*.service /opt/fitflow/app/deploy/systemd/fitflow-backup.timer /etc/systemd/system/ && sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now fitflow-worker fitflow-web fitflow-backup.timer
```

```bash
curl -s http://127.0.0.1:3000/api/health
```

The web unit runs migrations on start (`ExecStartPre`). Both units restart automatically and log to journald (`journalctl -u fitflow-web -u fitflow-worker -f`). The worker is a separate process with a 1.5 GB memory cap, AI concurrency 1 and PDF concurrency 1.

## 5. Nginx and HTTPS

```bash
sudo cp /opt/fitflow/app/deploy/nginx/fitflow-proxy.conf /etc/nginx/fitflow-proxy.conf && sudo cp /opt/fitflow/app/deploy/nginx/fitflow.conf /etc/nginx/sites-available/fitflow.conf && sudo ln -s /etc/nginx/sites-available/fitflow.conf /etc/nginx/sites-enabled/
```

Replace the domain in the file. Obtain a certificate (e.g. `sudo apt-get install certbot python3-certbot-nginx`, then `sudo certbot --nginx -d your.domain`), and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`APP_URL` must be the `https://` URL. Cookies are then marked `Secure`, and HSTS plus other security headers are sent by the app.

## 6. First login

Open `https://your.domain/register` and create the owner account. Public registration closes automatically afterwards (set `ALLOW_REGISTRATION=true` only if you deliberately want more accounts).

Optional push notifications: run `pnpm vapid:generate`, put the three values into the env file and restart both services.

## 7. Backups and restore

`fitflow-backup.timer` runs `dist/backup.mjs` nightly. It takes an online SQLite backup (safe while the app runs), checks it with `PRAGMA integrity_check`, copies private progress photos, writes a SHA-256 manifest and prunes backups older than `BACKUP_RETENTION_DAYS`. Generated PDFs and temporary AI files are not backed up. For offsite copies, encrypt them first (e.g. `age`/`gpg`); nothing is sent anywhere by default.

Restore (tested procedure):

```bash
sudo systemctl stop fitflow-web fitflow-worker
```

```bash
cd /opt/fitflow/app && sudo -u fitflow -H bash -c 'set -a; . /etc/fitflow/fitflow.env; set +a; npx tsx scripts/restore.ts /var/backups/fitflow/fitflow-<timestamp>'
```

The first run only verifies the checksum and integrity. Re-run with `--yes` to replace the database; the current file is kept as `*.pre-restore-<ts>`. Then start both services again:

```bash
sudo systemctl start fitflow-worker fitflow-web
```

## 8. Updates

```bash
cd /opt/fitflow/app && sudo -u fitflow -H git pull && sudo -u fitflow -H pnpm install --frozen-lockfile && sudo -u fitflow -H bash -c 'set -a; . /etc/fitflow/fitflow.env; set +a; pnpm build && node dist/backup.mjs'
```

```bash
sudo systemctl restart fitflow-worker fitflow-web
```

Migrations run automatically on web start. Jobs that were running during the restart are recovered and retried by the worker.

## 9. Password recovery

```bash
cd /opt/fitflow/app && sudo -u fitflow -H bash -c 'set -a; . /etc/fitflow/fitflow.env; set +a; npx tsx scripts/reset-password.ts owner@example.com'
```
