# TaskMind

An AI personal task organizer. Add a task in plain language and TaskMind sorts it
by **category**, **priority**, and **due date**, with a short reason for each call.

Faithful React rebuild of the original design, with localStorage persistence so
your tasks, context, and settings survive a refresh.

## Features

- **Real AI sorting** — type a task and Groq (`llama-3.3-70b`) assigns a category, priority, due-date hint, and a one-line reason. The API key lives **server-side** in a Vercel function — no end user ever needs a key.
- **Dynamic, emergent categories** — no fixed tabs. New users start empty; a tab appears only for a category the AI actually creates, and any category gets a stable auto-color.
- **Empty-first onboarding** — brand-new visitors see a clean "add your first task" screen.
- **Per-user isolation** — all data is per-browser via `localStorage`; sharing the URL gives every visitor their own private app.
- **Graceful fallback** — if the API is unreachable (local dev, no key, offline), it silently falls back to a local keyword sorter so the app never breaks.
- **Dynamic home headline** — adapts to your load ("2 things are overdue → start with…", "all caught up", etc.).
- **About you context** — describe yourself in a few words and AI writes a profile it uses to personalize sorting; or write it manually.
- **Appearance** — full light & dark themes.
- **Notifications** — daily summary, overdue reminders, high-priority alerts toggles.

## Environment

Set in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | your Groq API key (from console.groq.com) |

Without it, the app still runs on the local keyword fallback.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview
```

## Deploy

Vite app — deploys to Vercel out of the box (build command `npm run build`, output `dist`).

## Stack

React 18 + Vite.
