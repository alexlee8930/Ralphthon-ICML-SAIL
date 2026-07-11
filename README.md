# Ralph Science Web

Frontend for the **Ralph paper-review agent** (ICML AC-style reviewer).
The UI is a pixel-faithful web port of the MIT-licensed
[Open Science Desktop](https://github.com/ai4s-research/open-science)
(the open-source Claude Science alternative) — see `LICENSES/open-science-MIT.txt`.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (design tokens ported 1:1 — paper-tone light/dark themes)
- **Recoil** — UI state (sidebar/inspector widths, theme, palette, composer draft)
- **TanStack Query** — all server state (papers, threads, scores)
- react-router-dom, Radix UI primitives, lucide-react, react-markdown

## Run

```bash
npm install
npm run dev        # http://localhost:5199 — runs on built-in mock data
```

## Connecting the real Ralph agent API

The UI runs standalone on a mock adapter until the agent backend exists.
To point it at the real API:

```bash
echo 'VITE_RALPH_API_URL=http://localhost:8000' > .env.local
npm run dev
```

Expected endpoints (see `src/api/types.ts` + `src/api/client.ts`, the single
source of truth):

| Method | Path | Purpose (pipeline stage) |
|---|---|---|
| GET | `/api/papers` | list papers |
| POST | `/api/papers` | upload paper (multipart: title, abstract?, file?/text?) |
| GET | `/api/papers/:id` | paper detail |
| GET | `/api/papers/:id/versions` | version history |
| GET | `/api/papers/:id/thread` | review thread blocks |
| POST | `/api/papers/:id/messages` | author message / rebuttal (+optional revision file) → S2 reply |
| POST | `/api/papers/:id/review` | trigger S1 review generation |
| POST | `/api/papers/:id/metareview` | S3 meta-review synthesis |
| GET | `/api/papers/:id/score` | S4/S5 score + decision + award proximity, with S6 attributions |
| GET | `/api/sessions` | session list for the sidebar |

`ThreadBlock.type` maps agent output onto the thread UI:
`agent_review` (S1) / `agent_reply` (S2) / `meta_review` (S3) /
`score_report` (S4·S5) / `explanation` (S6).

### Review loop (`/review`) — the product flow

Submit a paper → the 3-head model scores it **out of 100** → a score in the
award-similar band (`select ≥ threshold`) is **SELECTED** and the loop ends;
anything lower gets an AC-style review (≈6–7 issue-style comments), one click
("Revise with AI") has the agent revise the manuscript into v(n+1), the new
version is rescored, and the loop repeats until selection. Contract in
`src/api/reviewLoop.ts`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/loop/papers` | submit paper → score v1 (+review if below band) |
| GET | `/api/loop/papers` | list submissions |
| GET | `/api/loop/papers/:id` | full loop state (versions, scores, comments) |
| POST | `/api/loop/papers/:id/revise` | AI revision → new version + rescore + re-review |
| POST | `/api/loop/papers/:id/versions` | manual revision upload (multipart) |

## Layout constants (from the reference, px-identical)

- Sidebar: 184–340px, default 232px, collapsible (⌘B)
- Inspector right pane: 360–960px, default 560px, maximizable
- Radii: card 14px / input 10px · Fonts: Inter, Source Serif 4, JetBrains Mono

## Known deviations from the reference

- Desktop-only surfaces (Tauri titlebar/traffic-light insets, bundled runtime
  management, Jupyter, auto-update) are omitted or rendered as static
  equivalents.
- Exotic scientific file viewers (molecule/genome/FITS/DOS/band/mesh) are
  stubbed with the same inspector chrome ("viewer unavailable on web").
- i18n replaced with inline English strings (locale files not ported).
