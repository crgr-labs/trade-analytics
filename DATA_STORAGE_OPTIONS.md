# Data storage options (beyond localStorage)

Notes from evaluating how to persist trade data + chart images if this app moves off
`localStorage` (e.g. to sync across devices, or survive clearing browser data), while
still hosting the static app on GitHub Pages. Personal/solo use case.

| | **Supabase** | **Firebase** | **Cloudflare (D1+R2+Worker)** | **Google Sheets + Drive** | **GitHub-as-DB** |
|---|---|---|---|---|---|
| **New account needed** | Yes | Yes (Google) | Yes | No (reuse Google) | No (reuse GitHub) |
| **Setup complexity** | Low — SDK + schema | Low — SDK + rules | Medium — write a Worker API | Medium — OAuth + API enablement | Low-medium — PAT + API calls |
| **Free tier size** | 500MB DB, 1GB storage | ~1GB Firestore, 5GB Storage | Very generous (100k req/day, 10GB D1, 10GB R2) | Sheets: 300 req/min; Drive: 15GB | 5,000 req/hr (authenticated), repo size limits (~1-5GB soft) |
| **Data model** | Postgres (real schema/SQL) | Firestore (NoSQL documents) | D1 = SQLite (real SQL) | Spreadsheet rows (no schema) | Flat JSON file(s) in git |
| **Querying/filtering** | Real SQL via SDK | Document queries, decent | Real SQL via SDK | None — fetch all, filter in JS | None — fetch file, filter in JS |
| **Image storage** | Supabase Storage, private buckets + signed URLs | Firebase Storage, private + rules | R2, private + signed URLs | Drive — needs "anyone with link" to display without re-auth (effectively public) | Committed as binary blobs, public if repo/Pages is public |
| **Auth model** | Built-in Auth + RLS | Built-in Auth + security rules | You build it (Worker can gate however you want) | Google OAuth, you manage token refresh | Fine-grained PAT embedded client-side (semi-public) |
| **Client-exposed secret risk** | Anon key + RLS (safe if rules correct) | Public config + rules (safe if rules correct) | None — key stays server-side in the Worker | OAuth token (short-lived, refreshed) | PAT (long-lived unless rotated — highest exposure risk) |
| **Concurrency/reliability** | Built for concurrent app writes | Built for concurrent app writes | Built for concurrent app writes | Fragile — a document, not a DB | Fine for one writer; git conflicts if ever concurrent |
| **Data portability/visibility** | Needs a DB tool to inspect | Needs Firebase console | Needs a DB tool/Worker endpoint | You can literally read/edit it as a spreadsheet | You can read it as a JSON file in the repo |
| **Bonus** | — | — | Cheapest to scale later if ever needed | Free built-in backup/versioning via Sheet revision history | Free full version history of every trade (git log) |
| **Migration effort from `localStorage`** | Moderate (async rewrite of stores) | Moderate (async rewrite of stores) | Moderate-high (rewrite stores + write the Worker) | Moderate (async rewrite + OAuth glue) | Moderate (async rewrite + PAT-based commit calls) |

## Recommendation

For a solo trade journal, the two worth shortlisting are:

- **Firebase** — least custom code, real SDK, private image storage via security rules.
- **GitHub-as-DB** — nothing new to trust (reuses the GitHub account already hosting
  the app), and gets free version history of every trade as a side effect.

The other three each have a sharper downside for this specific use case: Cloudflare
requires writing and maintaining a Worker as a thin API layer; Sheets + Drive forces
chart images to be effectively public to display without re-authenticating; Supabase
is solid but doesn't offer a real edge over Firebase here.

No decision has been made yet — the app currently persists everything to
`localStorage` only (see `TradeStore`/`PositionStore` in `app.js`).
