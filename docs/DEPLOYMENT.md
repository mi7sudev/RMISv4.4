# RMIS 2.0 — Production Deployment Runbook (10.10.120.102)

Restored reference for the deployment stack: HTTPS two-door topology, gate-aware
Turnstile, and the email gateway. Everything below assumes the app lives at
`~/Desktop/RMISv4` on `rmis-mirdc@10.10.120.102` and runs under pm2 behind Caddy.

---

## 1. Topology (two doors, one server)

| Door | URL | TLS | Who |
|---|---|---|---|
| Employee | `https://10.10.120.102` | Caddy `tls internal` | ADMIN / EVALUATOR (staff gate) |
| Public | `http://recruitment.bakalmirdc.site` | HTTPS at the Cloudflare edge | APPLICANT (public gate, Turnstile) |

`/etc/caddy/Caddyfile`:

```caddy
https://10.10.120.102 {
  tls internal
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}

http://recruitment.bakalmirdc.site {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

Both doors proxy to the same Next.js server (pm2, standalone build, port 3000).
Caddy sets `X-Forwarded-Host` / `X-Forwarded-For`; the app classifies the door
via host first (`src/lib/auth.ts` → `requestHost` / `isTrustedGate`), falling
back to the source-IP intranet check.

## 2. Production `.env` (server)

```bash
DATABASE_URL=file:/home/rmis-mirdc/Desktop/RMISv4/db/custom.db   # keep existing
INTRANET_ENFORCEMENT=on
RMIS_INTRANET_HOSTS=10.10.120.102
RMIS_PUBLIC_HOSTS=recruitment.bakalmirdc.site

# REAL domain-locked Turnstile pair — works only on the hosts above
TURNSTILE_SITE_KEY=0x4AAAAAAFFxBetq_7Nsxcwa
TURNSTILE_SECRET_KEY=0x4AAAAAAFFxBRJILQqaCPNtSb_HDAWGksk

# Email via mirdc_middleware (10.10.120.32:3232)
EMAIL_PROVIDER=gateway
EMAIL_GATEWAY_URL=http://10.10.120.32:3232
EMAIL_GATEWAY_KEY=78e69d5bef243d02d0a4151a862c273f3897f5eb4fbce9ed8a2c2378aae94337
```

Behavior:
- Employee door / intranet IP / localhost → **no captcha** (`GET /api/auth/captcha`
  returns `{ enabled:false }`).
- Public door → **invisible Turnstile** (`interaction-only`): auto-solves for
  humans, no "Success!" box on reload/navigation; login + register endpoints
  verify the token server-side (missing/invalid → **403**, distinct from the
  **401** invalid-credentials path).
- Never commit real Turnstile keys anywhere client-side; only the site key
  crosses to the browser, and only when the gate requires it.

## 3. Deploy steps (UI / code updates)

```bash
# on the workstation — copy changed sources (rsync/scp), then on the server:
cd ~/Desktop/RMISv4
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
pm2 logs rmis --lines 20          # sanity
```

Quick checks:
```bash
curl -sk https://10.10.120.102/api/health
curl -s http://recruitment.bakalmirdc.site/api/health
# gate matrix (should be false / true / false):
curl -sk "https://10.10.120.102/api/auth/captcha" -H "Host: 10.10.120.102"
curl -s "http://recruitment.bakalmirdc.site/api/auth/captcha"
curl -s "http://127.0.0.1:3000/api/auth/captcha"
```

## 4. Email gateway contract (mirdc_middleware, port 3232)

`src/lib/notify.ts` (`EMAIL_PROVIDER=gateway`) posts to:

```
POST http://10.10.120.32:3232/api/rmis/send
X-RMIS-Key: <EMAIL_GATEWAY_KEY>   # Bearer also accepted
{ "to", "subject", "text", "html" }
```

The middleware owns SMTP credentials and relays delivery logs to the Strapi
audit store (`http://10.10.120.43:1404/api/logs`). The legacy human endpoint
`POST /sendMail` and `send-mail.html` are untouched. Every RMIS send attempt is
also persisted locally to `email_logs` (status sent/failed/mock/skipped).

## 5. Local / sandbox notes

- Sandbox `.env` uses Cloudflare's **official always-pass dummy pair**
  (`1x0000…AA` site / `1x0000…AA` secret) — valid on any domain, so the public
  gate is fully testable locally. The real pair is commented out; uncomment
  only on the production server.
- Simulating the public gate locally: send `x-forwarded-host:
  recruitment.bakalmirdc.site` (that's exactly how the browser E2E validated
  the 403-without-token → 200-with-widget path).
- Node/Next synthesizes `x-forwarded-for: ::ffff:127.0.0.1` on direct requests;
  `isPrivateIp` unwraps IPv6-mapped IPv4 and trusts loopback hosts — don't
  remove those branches or local/dev logins will start requiring a captcha.
