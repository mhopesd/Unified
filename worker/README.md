# Unified Marketplace Worker

A Cloudflare Worker + D1 backend that lets the Unified game's marketplace
share missions across players. The Worker exposes a small REST API the
client (`src/marketplace/cloud.js`) already knows how to call.

## One-time setup

1. Install Wrangler and log in:

   ```
   npm install
   npx wrangler login
   ```

2. Create the D1 database (writes a `database_id` you'll paste in below):

   ```
   npx wrangler d1 create unified-marketplace
   ```

   Copy the `database_id` from the output into `wrangler.toml`, replacing
   `REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE`.

3. Apply the schema to the remote database:

   ```
   npm run db:migrate:remote
   ```

## Deploy

```
npm run deploy
```

Wrangler prints a URL like
`https://unified-marketplace.<your-subdomain>.workers.dev`. Paste that
into the game's settings panel under "Marketplace API URL". The client
will switch from local-only mode to using the live backend.

## Local dev

```
npm run db:migrate:local   # one-time, populates local D1
npm run dev                # http://localhost:8787
```

Use `http://localhost:8787` as the API URL in the game during local dev.

## API

| Method | Path                       | Body                       | Description                          |
|--------|----------------------------|----------------------------|--------------------------------------|
| GET    | /health                    | —                          | Liveness check                       |
| GET    | /missions?page&limit&sort  | —                          | List (sort: rating, newest, downloads, price) |
| POST   | /missions                  | mission JSON               | Upload (validates server-side)       |
| GET    | /missions/:id              | —                          | Single mission with comments         |
| GET    | /missions/search?q&limit   | —                          | Text search                          |
| POST   | /missions/:id/rate         | `{ "stars": 1-5 }`         | Rate (1 vote per voter, deduped)     |
| POST   | /missions/:id/comments     | `{ "author", "text" }`     | Add comment                          |
| POST   | /missions/:id/install      | —                          | Increments downloads + earnings      |

The client identifies voters via `X-Voter-Id` (random uuid in localStorage).
This is **not** authentication — it's just enough to dedupe trivial
re-rating. A real auth layer is the long-term answer.

## Schema

See `schema.sql`. Three tables: `missions`, `ratings`, `comments`.
Aggregate rating + count are recomputed on every vote and stored on
`missions` for cheap reads.

## Limits & defense in depth

- Server validates name/author/description lengths, objective shape,
  trigger zone bounds, price range, etc. The client also validates;
  the server is the trust boundary.
- CORS is `*` for now. Lock down to your game's origin before going live.
- No rate limiting yet. Cloudflare's free tier has generous request
  caps but nothing prevents a single browser from spamming
  `/missions/:id/comments`. Add a Turnstile challenge or per-IP rate
  limiter when this becomes a real problem.
