# TaskMind project instructions

## Conversational task imports

When the user asks to add tasks to TaskMind, generate a clickable Markdown link
labelled **Add to TaskMind** using:

`https://taskmind-five.vercel.app/#tasks=ENCODED_JSON`

Encode a JSON array with `encodeURIComponent` encoding, not base64. Each task
requires `title`; optional fields are `due`, `category`, `priority`, and
`description`. Priority must be `High`, `Medium`, or `Low`. Deadlines must be ISO
timestamps with an explicit offset. Default to Asia/Karachi (`+05:00`) unless the
user specifies otherwise. Resolve relative dates using the current user date;
ask if material scheduling details are ambiguous. Omit `due` for unscheduled tasks.

Keep each link under 50 tasks and 20,000 decoded characters; split large batches.
Never include sync codes, credentials, or other secrets in links. The user opens
the link in their usual TaskMind browser, reviews it, then presses **Add tasks**.
Do not claim tasks are saved merely because a link was generated. This workflow
does not grant access to read existing tasks. It needs no Custom GPT or connector.
New chats need these instructions or retrieval of the Personal Brain TaskMind note;
do not promise automatic knowledge across every ChatGPT conversation.

## Preserve data

Retain duplicate detection by normalized title and deadline. Preserve pending
imports when connecting sync, and clear their recovery state only after the
server acknowledges saving. Do not expose or request the private sync code in chat.
The existing snapshot sync has concurrent-edit limitations; do not describe it as
fully conflict-safe.

For changes to import/sync behavior, run `node --test src/taskImport.test.js` and
`npm run build`. Reuse the existing React/Vite, Vercel, and Redis architecture.
