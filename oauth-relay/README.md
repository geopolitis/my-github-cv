# OAuth Relay (Cloudflare Worker)

This worker proxies GitHub OAuth Device Flow endpoints so your GitHub Pages frontend avoids browser CORS/token-exchange failures.

## 1) Prerequisites

- Cloudflare account
- `wrangler` installed:

```bash
npm install -g wrangler
```

## 2) Deploy

From `/Users/geo/Projects/my-github-cv/oauth-relay`:

```bash
wrangler login
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

After deploy, copy the Worker URL (example: `https://my-github-cv-oauth-relay.<subdomain>.workers.dev`).

## 3) GitHub OAuth App settings

In GitHub `Settings -> Developer settings -> OAuth Apps -> <your app>`:

- `Homepage URL`: `https://geopolitis.github.io/my-github-cv/`
- Enable Device Flow for the app.
- Keep your `Client ID` from this app.

The app `Client Secret` goes only into Worker secret `GITHUB_CLIENT_SECRET`.

## 4) Use in frontend

Open your app:

`https://geopolitis.github.io/my-github-cv/`

Then fill:

- `OAuth Relay URL`: your deployed Worker URL
- `GitHub OAuth Client ID`: from your OAuth app

Click `Sign in with GitHub`.

## 5) Endpoints exposed by relay

- `POST /oauth/device/code`
- `POST /oauth/device/token`
- `GET /health`
