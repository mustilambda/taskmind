# TaskMind

An AI personal task organizer. Add a task in plain language and TaskMind sorts it
by **category**, **priority**, and **due date**, with a short reason for each call.

Faithful React rebuild of the original design, with localStorage persistence so
your tasks, context, and settings survive a refresh.

## Features

- **Smart capture** — type a task, `classify()` auto-assigns category / priority / date / reason from keywords.
- **Dynamic home headline** — adapts to your load ("2 things are overdue → start with…", "all caught up", etc.).
- **Filters** — All · Content · App Dev · Brand · Research · Admin · Personal.
- **Task rows** — round checkbox, category dot, priority, date (overdue in red), AI reason, delete, slide-in animation.
- **About you context** — generate via an LLM prompt (copy → paste summary back) or write manually; auto-detects focus areas.
- **Appearance** — full light & dark themes.
- **Notifications** — daily summary, overdue reminders, high-priority alerts toggles.
- **Persistence** — everything saved to `localStorage`.

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
