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

### Tonight's plan and Idea inbox

Tonight's plan starts with an editable 8–11 PM window in the device's local time.
Choose existing tasks and estimate their duration to see the remaining space.
Adding a task to the plan does not change its deadline. Completed slots keep their
place in the evening, and unfinished tasks remain in the task list the next day.
The window is saved on this device; planned dates and estimates use existing task
storage and sync.

The Idea inbox captures ideas without a deadline. Keep them under Undecided,
This week, or Later; promote one to Tonight when it fits, or use Make task to move
it into the normal task list. This week is a shortlist, not an automatic deadline.
Completed tasks in the normal list are collapsed by default.

Planning checks: `node --test src/eveningPlan.test.js`.

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

## Add tasks from a ChatGPT link

Once this version is deployed, any ChatGPT conversation can generate an import
link. No connector, Custom GPT, or AI API call is needed for importing. Open the
link in the browser where you already use TaskMind. Review the preview and press
**Add tasks**. Saving uses the existing local storage and synchronization setup.
This does not give ChatGPT permission to read tasks or confirm that you saved them.

Copy these instructions into a ChatGPT conversation:

> When I ask to add tasks to TaskMind, give me a clickable Markdown link with
> this format: https://taskmind-five.vercel.app/#tasks=ENCODED_JSON
> Replace ENCODED_JSON with a URL-encoded JSON array (encodeURIComponent encoding,
> not base64). Each object has a required title and optional due, category,
> priority, and description. Priority is High, Medium, or Low. Due must be an ISO
> timestamp with an explicit UTC offset; use Asia/Karachi (+05:00) unless I say
> otherwise. Resolve relative dates against the current date and ask if the date
> is unclear. Omit due for unscheduled tasks. Keep links short and split large
> schedules into smaller batches (maximum 50 tasks per link; the URL-decoded
> `tasks` JSON text must be at most 20,000 UTF-16 code units (JavaScript string
> `.length`), including JSON syntax and whitespace, measured before JSON parsing).
> Do not include secrets or my sync code. Label the link "Add to
> TaskMind" and tell me to review and confirm in the app. Never claim tasks were
> saved merely because you generated the link.

Example (one unscheduled task):

https://taskmind-five.vercel.app/#tasks=%5B%7B%22title%22%3A%22Take%20a%20walk%22%7D%5D

Matching titles (case and whitespace insensitive) with the same deadline are
skipped, including completed tasks. Task details remain in browser history and
in the conversation/link wherever it is shared, so avoid sensitive information.
The existing snapshot-based sync still has its pre-existing concurrent editing
limitations; avoid editing on multiple devices simultaneously.

Validation: `node --test src/taskImport.test.js` and `npm run build`.

### Dashboard, undo and sync merging

The dashboard ring tracks **today**: tasks finished today out of what is still open.
The stats are tappable filters, "Move overdue to today" reschedules late tasks in one go,
and the week strip filters by day. Completing or deleting a task offers a 6-second Undo.

Sync now merges per task (`updatedAt` stamps plus deletion tombstones) instead of
replacing everything, so edits on two devices to *different* tasks are both kept.
Two devices editing the *same* task at once still resolve to the latest edit.

Checks: `node --test src/*.test.js lib/*.test.js`.
