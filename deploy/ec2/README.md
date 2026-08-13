# Deploy AI-Concierge Backend to AWS EC2

This guide is for a **dedicated backend host** on **Ubuntu 24.04 LTS**. It
assumes:

- NestJS runs on the EC2 instance behind `nginx`
- PostgreSQL runs on the same EC2 instance
- the backend is exposed on its own domain or subdomain such as
  `api.example.com`

If you want the API to share the same domain as a WordPress site and intercept
the GoHighLevel root callback, use the WordPress-specific guide in
[`../README.md`](../README.md) instead.

## What this setup creates

- app user: `ai-concierge`
- app root: `/srv/ai-concierge`
- env file: `/etc/ai-concierge/backend.env`
- systemd service: `ai-concierge-api`
- reverse proxy: `nginx`
- database: local PostgreSQL

## 1. Prepare AWS

Create or reuse:

- an EC2 instance running **Ubuntu 24.04 LTS**
- a security group allowing:
  - `22/tcp` from your IP
  - `80/tcp` from the internet
  - `443/tcp` from the internet
- a DNS `A` record pointing your API hostname to the EC2 public IP

Example hostname used below: `api.example.com`

## 2. SSH into the instance

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

## 3. Bootstrap the server

Copy this repo onto the instance first, or clone it directly there. Then run:

```bash
cd /srv
sudo mkdir -p /srv/ai-concierge
sudo chown ubuntu:ubuntu /srv/ai-concierge
```

If you are cloning from Git:

```bash
git clone <YOUR_REPO_URL> /srv/ai-concierge
cd /srv/ai-concierge
```

Then run the bootstrap script as `root`. Set a strong PostgreSQL password first:

```bash
cd /srv/ai-concierge
sudo DB_PASSWORD='replace-with-a-strong-db-password' \
  NODE_VERSION='22.22.3' \
  bash deploy/ec2/bootstrap-ubuntu-24.04.sh
```

That script installs system packages, installs Node.js, creates the app user,
creates `/etc/ai-concierge/backend.env`, and creates the PostgreSQL role and
database. It also makes `/srv/ai-concierge` owned by the `ai-concierge` app
user so deploys can run without root.

## 4. Create the production env file

Start from the provided template:

```bash
sudo cp deploy/ec2/backend.env.example /etc/ai-concierge/backend.env
sudo chown root:ai-concierge /etc/ai-concierge/backend.env
sudo chmod 640 /etc/ai-concierge/backend.env
sudo nano /etc/ai-concierge/backend.env
```

Fill in the real values, especially:

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- Stripe keys and price ids
- `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_REDIRECT_URI`
- `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`
- `MAIL_USER`, `MAIL_PASS`, and `MAIL_FROM`
- `SUPPORT_INBOX_EMAIL` (a monitored inbox with a named owner)
- `SUPPORT_REQUEST_RETENTION_DAYS` after privacy-policy approval

Generate secrets on the server:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one value for `JWT_SECRET` and one for `ENCRYPTION_KEY`.

For a dedicated API hostname, use callback URLs like:

```env
GHL_REDIRECT_URI="https://api.example.com/oauth/callback"
HUBSPOT_REDIRECT_URI="https://api.example.com/integrations/hubspot/callback"
```

The redirect URI must exactly match what is registered in each provider.

## 5. Install the systemd service

```bash
sudo cp deploy/ec2/ai-concierge-api.service /etc/systemd/system/ai-concierge-api.service
sudo systemctl daemon-reload
sudo systemctl enable ai-concierge-api
```

## 6. Install nginx

Copy the site config and replace the placeholder hostname:

```bash
sudo cp deploy/ec2/nginx-api.conf /etc/nginx/sites-available/ai-concierge-api
sudo nano /etc/nginx/sites-available/ai-concierge-api
```

Change:

```nginx
server_name api.example.com;
```

to your real hostname.

Then enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/ai-concierge-api /etc/nginx/sites-enabled/ai-concierge-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Build and deploy the backend

Run the deploy script as the app user:

```bash
sudo -u ai-concierge bash /srv/ai-concierge/deploy/ec2/deploy-backend.sh
```

On the very first deploy, seed the plans too:

```bash
sudo -u ai-concierge RUN_SEED=1 bash /srv/ai-concierge/deploy/ec2/deploy-backend.sh
```

Then start the API:

```bash
sudo systemctl restart ai-concierge-api
sudo systemctl status --no-pager ai-concierge-api
```

## 8. Add TLS

Once DNS resolves to the instance:

```bash
sudo certbot --nginx -d api.example.com
```

After TLS is issued, verify:

```bash
curl -s https://api.example.com/health
```

Expected response:

```json
{"ok":true,"service":"ai-concierge-api","oauth":{"ghlRootCallback":"GET /","ghlLegacyCallback":"GET /oauth/callback"}}
```

## 9. Mobile app production config

Set the mobile app API base URL to the public HTTPS endpoint:

```env
EXPO_PUBLIC_API_BASE_URL=https://api.example.com
```

## 10. Ongoing deploys

After you push backend changes:

```bash
cd /srv/ai-concierge
sudo -u ai-concierge git pull
sudo -u ai-concierge bash deploy/ec2/deploy-backend.sh
sudo systemctl restart ai-concierge-api
```

Useful checks:

```bash
sudo journalctl -u ai-concierge-api -n 100 --no-pager
sudo journalctl -u ai-concierge-api -f
curl -s http://127.0.0.1:4000/health
curl -s https://api.example.com/health
```

Support delivery is durable and retries in the background. Configure log
monitoring for `support_delivery_exhausted` and
`support_confirmation_exhausted`; either event needs manual follow-up using
the case reference in the log. Never add support descriptions to application
logs.

## Notes

- `CORS_ORIGINS` can be left blank if only native mobile clients call the API.
- For production behind nginx, keep `HOST=127.0.0.1`.
- The deploy script symlinks `backend/.env` to `/etc/ai-concierge/backend.env`
  so Prisma migrations and seeds use the same production config as the running
  service.
