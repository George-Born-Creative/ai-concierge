# Deploy AI-Concierge API on borncreative.net

[borncreative.net](https://borncreative.net/) is the **WordPress marketing site**. GHL OAuth will **not** return to the mobile app until Nest runs behind that domain and nginx forwards OAuth/API traffic to it.

## Why OAuth gets stuck on the website

1. User approves GHL → browser goes to `https://borncreative.net/?code=...&state=...`
2. **Without nginx**, WordPress shows the homepage → tokens are never saved → app never opens
3. **With nginx**, that URL is proxied to Nest → Nest saves tokens → **302** → `aiconcierge://oauth/ghl?status=ok` → app opens

## Server setup (George / hosting)

1. Run Nest on the server (port 4000):

   ```bash
   cd backend
   npm ci
   npm run build
   # set production .env (DATABASE_URL, JWT_SECRET, GHL_REDIRECT_URI=https://borncreative.net/, etc.)
   pm2 start dist/main.js --name ai-concierge-api
   ```

2. Merge [`nginx-borncreative.net.conf`](./nginx-borncreative.net.conf) into the site’s nginx config (adjust SSL paths and PHP socket).

3. Test:

   ```bash
   curl -s https://borncreative.net/health
   # → {"ok":true,"service":"ai-concierge-api",...}
   ```

4. In GHL Marketplace, keep redirect URL **`https://borncreative.net/`** (exact, with trailing slash).

5. Mobile production `.env`:

   ```env
   EXPO_PUBLIC_API_BASE_URL=https://borncreative.net
   ```

## Local dev (your PC + phone)

Do **not** use `https://borncreative.net/` for OAuth until step 3 above passes.

Use LAN callback instead:

| Setting | Value |
|---------|--------|
| `backend/.env` → `GHL_REDIRECT_URI` | `http://<PC-LAN-IP>:4000/oauth/callback` |
| GHL Marketplace (selected) | Same LAN URL |
| Mobile `.env` | Leave `EXPO_PUBLIC_API_BASE_URL` unset (auto-detect from Expo Metro) |

Restart backend + `npx expo start -c`.
