# Reboot 15

My 31-day training plan (6 Oct to 4 Nov 2026), with ticks synced across devices.

## What's inside

- `index.html`: the whole plan, pictures included. Ticks are kept in the browser and synced to the API.
- `manifest.webmanifest`, `sw.js`, `icons/`: make it installable and usable offline.
- `vercel.json`: makes sure the service worker always updates.
- `api/state.js`: a Vercel serverless function that saves and loads ticks from Upstash Redis.
- Both read and write need a passphrase, so nobody else can see or change your ticks.

## Deploy (about 10 minutes)

1. Push this folder to a new GitHub repo, for example `reboot15`.
2. On vercel.com: Add New → Project → import the repo. No build settings needed. Deploy.
3. In the project: Storage → Create Database → Upstash for Redis (free plan) → connect it to this project.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
4. Settings → Environment Variables → add `APP_PASSPHRASE` with a long passphrase of your choice
   (for Production, Preview and Development).
5. Deployments → Redeploy, so the function picks up the new variables.
6. Open the site, type the passphrase in "Sync passphrase", click Connect. Do the same on your other devices.

## Check it works

```bash
curl -H "x-passphrase: YOUR_PASSPHRASE" https://YOUR-PROJECT.vercel.app/api/state
```

You should get `{"done":{...},"updatedAt":"..."}`. A wrong passphrase returns 401.

## Install it as an app

- Android (Chrome or Samsung Internet): open the site, menu → **Install app** (or Add to Home screen).
- iPhone (Safari): Share → **Add to Home Screen**.
- Laptop (Chrome or Edge): the install icon at the right of the address bar.

The app opens full screen, works offline, and syncs your ticks once you're back online.
After you push a new `index.html`, close and reopen the app once to get the update.
If you change `sw.js`, bump `CACHE` (for example `reboot15-v2`).

## How sync behaves

- The page loads the latest ticks from the server when it opens and when you come back to the tab.
- Each tick is saved about a second later. The newest save wins, so tick on one device at a time.
- Offline, ticks stay in the browser and go up with the next tick once you're back online.

## Local development

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```
