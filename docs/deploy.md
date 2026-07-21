# Deployment - ledgerfactor.unitynodes.com

The demo runs permanently as systemd services behind Caddy + Cloudflare.

## Topology

```
Cloudflare (TLS, orange cloud)
        │
        ▼
Caddy  ledgerfactor.unitynodes.com  (CF Origin cert *.unitynodes.com)
        │
        ├── /api/*  ─────▶  lf-server   :8080   (Node gateway + AI scoring)
        │                        │
        │                        ▼
        │                   lf-jsonapi  :7575   (Daml JSON Ledger API)
        │                        │
        │                        ▼
        │                   lf-sandbox  :6865   (Canton sandbox, in-memory)
        │
        └── /*      ─────▶  /var/www/ledgerfactor   (static SPA build)
```

## systemd services

Three units in `/etc/systemd/system/` (sources in `scripts/systemd/`), all run
under a dedicated service user, `Restart=always`, enabled on boot. The chain is ordered and
cascades: `lf-jsonapi` and `lf-server` are `PartOf` / `Requires` their
dependency, so restarting `lf-sandbox` restarts the whole chain.

```bash
systemctl status  lf-sandbox lf-jsonapi lf-server
journalctl -u lf-server -f              # follow gateway logs
sudo systemctl restart lf-sandbox        # cascades to json-api + server
```

The Canton sandbox is in-memory, so every (re)start yields a fresh ledger. The
server allocates each session's parties on demand and reuses any that already
exist, so a crash/restart never duplicates them, and it seeds no data at boot
(the pre-built demo scene only appears when the `/api/actions/sample` endpoint is
called).

## Caddy

Appended block in `/etc/caddy/Caddyfile` (backup at
`Caddyfile.bak-before-ledgerfactor`):

```
ledgerfactor.unitynodes.com {
    encode gzip zstd
    tls /etc/ssl/cf-origin-unitynodes.pem /etc/ssl/cf-origin-unitynodes-key.pem
    handle /api/* { reverse_proxy localhost:8080 }
    handle {
        root * /var/www/ledgerfactor
        try_files {path} /index.html
        file_server
    }
}
```

Reload after edits: `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

## DNS (Cloudflare, zone unitynodes.com)

One record, proxied like the other subdomains:

```
A   ledgerfactor   <origin-ip>   (Proxied 🟠)
```

## Updating the app

```bash
# frontend
cd web && npm run build && sudo cp -r dist/. /var/www/ledgerfactor/

# backend / daml
daml build && sudo systemctl restart lf-sandbox   # cascades to json-api + server
```

## Secrets (optional)

`lf-server.sh` sources `/etc/ledgerfactor.env` if present, so keys never live in
the repo. Drop them there (owned by the service user, `chmod 600`) and restart
`lf-server`:

```
GROQ_API_KEY=gsk_...        # activates the live LLM underwriting memo (or ANTHROPIC_API_KEY)
GROQ_MODEL=llama-3.3-70b-versatile
```

With no key the memo is the deterministic rules-engine template (the UI shows a
`RULES` badge). The JSON API runs with `--allow-insecure-tokens`, so `LF_JWT_SECRET`
is optional; unset, the server signs with an ephemeral per-process secret.
