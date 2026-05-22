# GHL OAuth + mobile deep link

## URLs (three different roles)

| URL | Where registered | Purpose |
|-----|------------------|---------|
| `GHL_REDIRECT_URI` (backend `.env`) | GHL Marketplace → Redirect URL | GHL sends `?code&state` here after user approves |
| `GET /integrations/ghl/finish` | Not in Marketplace | Redirect HTML calls this to exchange code + save tokens |
| `aiconcierge://oauth/ghl?status=ok` | **Not** in Marketplace | Backend redirect page sends user back into the app |

## Flow

1. App: `GET /integrations/ghl/auth-url?returnUrl=aiconcierge://oauth/ghl` (JWT + active subscription).
2. App opens GHL authorize URL in `WebBrowser.openAuthSessionAsync`.
3. GHL → `GHL_REDIRECT_URI?code&state` (Nest exchanges the code, saves tokens, returns success HTML).
4. Success HTML → `aiconcierge://oauth/ghl?status=ok` (~150ms auto-redirect).
5. Legacy `GET /integrations/ghl/finish` still exists but the redirect page no longer calls it.
6. Route `app/oauth/[provider].tsx` → `/connect` → `GET /integrations/ghl/status` → Connected UI.

## Local dev checklist

1. `GHL_REDIRECT_URI=http://<PC-LAN-IP>:4000/oauth/callback` in `backend/.env`.
2. Same URL added in GHL Marketplace (exact match).
3. `EXPO_PUBLIC_API_BASE_URL=http://<PC-LAN-IP>:4000` in mobile `.env`.
4. Phone can open `http://<PC-LAN-IP>:4000/health` (JSON).
5. Restart backend + `npx expo start -c`.

## Production (borncreative.net)

Configured in `backend/.env`:

```env
GHL_REDIRECT_URI=https://borncreative.net/
```

The WordPress site stays on the same domain; nginx proxies API paths and **only** `GET /?code=...` to Nest. Full steps: [`deploy/README.md`](../../deploy/README.md) and [`deploy/nginx-borncreative.net.conf`](../../deploy/nginx-borncreative.net.conf).

| Check | Command |
|-------|---------|
| API reachable | `curl -s https://borncreative.net/health` → JSON |
| GHL Marketplace | Redirect URL = `https://borncreative.net/` (exact match) |
| Mobile | `EXPO_PUBLIC_API_BASE_URL=https://borncreative.net` |

**Do not** register `aiconcierge://oauth/ghl` in GHL — that is only the app deep link after success.

## Error: `redirect_uri does not match client value`

GHL compares the `redirect_uri` in the authorize URL (from `GHL_REDIRECT_URI` in `backend/.env`) to **Redirect URLs** in your Marketplace app. They must match exactly.

| What you see in the error | Fix |
|---------------------------|-----|
| `http://10.240.71.178:4000/oauth/callback` | Add that exact URL in Marketplace → Auth → Redirect URLs, **and** restart the backend after saving `.env`. |
| `https://borncreative.net/` | Register `https://borncreative.net/` (same trailing slash) and deploy nginx (`deploy/README.md`). |

After changing `.env`, restart Nest and confirm the log line: `GHL OAuth redirect_uri (must match Marketplace): ...`

You can register **multiple** redirect URLs in GHL (local + production) and switch `GHL_REDIRECT_URI` in `.env` when you change environments.
