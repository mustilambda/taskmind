import * as chrono from "chrono-node";
export const STORAGE_KEY = "taskmind.v2";

export const DEFAULT_STATE = {
  dark: false,
  tasks: [], // empty-first: brand new users see no tasks and no tabs
  deleted: {}, // { [taskId]: deletedAt } — tombstones so deletions survive sync merges
  pendingImports: [], // local recovery copy, cleared only after a successful push
  savedContext: null,
  notify: { daily: true, overdue: true, priority: false },
  aiSummary: null, // { sig, line1, line2 } — funny+motivational home headline
  sync: { code: "", lastSyncedAt: 0 }, // private cross-device sync
  corrections: [], // { title, category, priority, at } — user fixes to AI calls, fed back as few-shot examples
};

// Fields that sync across devices (theme stays per-device on purpose).
export const syncableData = (s) => ({
  tasks: Array.isArray(s.tasks) ? s.tasks : [],
  deleted: s.deleted && typeof s.deleted === "object" && !Array.isArray(s.deleted) ? s.deleted : {},
  savedContext: s.savedContext || null,
  notify: { ...DEFAULT_STATE.notify, ...(s.notify || {}) },
  aiSummary: s.aiSummary || null,
  corrections: Array.isArray(s.corrections) ? s.corrections : [],
});

// Normalize data loaded from another device before merging it into local
// state. Older blobs predate some fields, and remote data must not be allowed
// to replace arrays/objects with malformed values.
export function normalizeSyncedData(data) {
  const safe = data && typeof data === "object" ? data : {};
  return syncableData({ ...DEFAULT_STATE, ...safe });
}

export const SYNC_WORDS_A = ["swift", "calm", "bright", "bold", "quiet", "lucky", "amber", "cobalt", "ember", "misty", "noble", "brisk"];
export const SYNC_WORDS_B = ["otter", "falcon", "cedar", "harbor", "lantern", "pixel", "comet", "willow", "raven", "meadow", "quartz", "delta"];
export function makeSyncCode() {
  const a = SYNC_WORDS_A[Math.floor(Math.random() * SYNC_WORDS_A.length)];
  const b = SYNC_WORDS_B[Math.floor(Math.random() * SYNC_WORDS_B.length)];
  return `${a}-${b}-${Math.floor(1000 + Math.random() * 9000)}`;
}
export async function callSync(payload) {
  const r = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.includes("application/json")) throw new Error("sync unavailable");
  return r.json();
}

// Signature of the task state that the summary depends on. If it doesn't
// change, we keep the cached summary instead of spending another API call.
export function summarySig(tasks) {
  return tasks.map((t) => `${t.id}:${t.done ? 1 : 0}:${t.category || ""}:${t.priority || ""}:${t.overdue ? 1 : 0}:${t.title}`).join("|");
}

export const PROMPT =
  "I'm setting up TaskMind, a personal AI task organizer. Write a short profile of me (4–6 sentences) that it can use as context when sorting my tasks by category, priority, and due date.\n" +
  "Cover:\n" +
  "• my role and field\n" +
  "• the projects I'm working on right now\n" +
  "• the kinds of work I juggle (content, app dev, brand, research, admin, personal)\n" +
  "• my usual deadlines and what I treat as high priority\n" +
  "• how I like to work\n" +
  "Here's a bit about me: [WRITE A FEW WORDS ABOUT YOURSELF]\n" +
  "Return only the profile paragraph — nothing else.";

export const NOTIF_DEFS = [
  { key: "daily", label: "Daily summary", desc: "A morning digest of what's due today." },
  { key: "overdue", label: "Overdue reminders", desc: "Nudge me when something slips past its date." },
  { key: "priority", label: "High-priority alerts", desc: "Remind me when a high-priority task is due." },
];

/* ---------------------------- theming ---------------------------- */
export function palette(dark) {
  if (dark)
    return {
      outer: "#0E0C09", bg: "#15120E", frame: "#221C15", text: "#EFE8DA", sub: "#9A9080",
      faint: "#73695A", line: "#26201A", accent: "#E45D4E", green: "#82BE86",
      checkBorder: "#3D362B", delete: "#4F4839", card: "#100E0A", seg: "#0F0D0A", segActive: "#241E17",
      pris: { High: "#E45D4E", Medium: "#E0B24A", Low: "#5FC97E" },
      overdue: "#E45D4E", catSat: 55, catLight: 70,
    };
  return {
    outer: "#E7DDCA", bg: "#F2EBDC", frame: "#E0D5C0", text: "#211C16", sub: "#6E675B",
    faint: "#948B79", line: "#E2D7C2", accent: "#BE3A2E", green: "#6FA873",
    checkBorder: "#CABFA9", delete: "#BBB09A", card: "#EDE5D3", seg: "#E6DCC8", segActive: "#FFFDF8",
    pris: { High: "#BE3A2E", Medium: "#A8780F", Low: "#3F9D5C" },
    overdue: "#BE3A2E", catSat: 60, catLight: 40,
  };
}

// Nice fixed hues for common categories; anything else gets a stable
// hash-based color so AI-invented categories still look consistent.
export const KNOWN_HUE = {
  Content: 258, "App Dev": 142, Brand: 22, Research: 212, Admin: 40, Personal: 45,
  Work: 200, Health: 160, Finance: 95, Home: 30, Learning: 280, Errands: 320,
};
export function catColor(name, c) {
  let hue = KNOWN_HUE[name];
  if (hue == null) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    hue = h % 360;
  }
  return `hsl(${hue} ${c.catSat}% ${c.catLight}%)`;
}

/* ----------------- local fallback sorter (no API) ---------------- */
export function classifyLocal(text) {
  const t = text.toLowerCase();
  let category = "Personal";
  if (/\b(bug|build|deploy|api|code|app|feature|ship|backend|frontend|release|staging)\b/.test(t)) category = "App Dev";
  else if (/\b(logo|brand|color|colour|font|identity|design|palette|mockup)\b/.test(t)) category = "Brand";
  else if (/\b(write|content|post|video|blog|newsletter|article|record|script|caption|publish)\b/.test(t)) category = "Content";
  else if (/\b(research|read|study|analyze|analyse|competitor|explore|review|survey)\b/.test(t)) category = "Research";
  else if (/\b(expense|report|invoice|email|schedule|admin|file|submit|paperwork|tax|finance)\b/.test(t)) category = "Admin";

  let priority = "Medium";
  if (/\b(urgent|asap|today|now|critical|bug|fix|deadline|blocker|overdue)\b/.test(t)) priority = "High";
  else if (/\b(maybe|sometime|eventually|weekend|whenever|someday|later)\b/.test(t)) priority = "Low";

  const dateLabel = priority === "High" ? "Today" : priority === "Low" ? "This weekend" : "Tomorrow";
  const reason =
    "Sorted by keywords — set as " + priority + " priority" +
    (dateLabel === "This weekend" ? ", flexible timing." : ", suggested for " + dateLabel.toLowerCase() + ".");
  return { category, priority, dateLabel, reason, overdue: false };
}
export function detectCatsLocal(text) {
  const t = (text || "").toLowerCase();
  const map = {
    Content: /\b(content|write|writing|blog|newsletter|article|video|post|copy|publish|editorial)\b/,
    "App Dev": /\b(app|dev|develop|code|coding|engineer|software|build|product|backend|frontend|mobile|web)\b/,
    Brand: /\b(brand|design|logo|identity|visual|creative|marketing)\b/,
    Research: /\b(research|study|analy|competitor|user|insight|explore|data)\b/,
    Admin: /\b(admin|finance|invoice|expense|operations|ops|email|schedul|paperwork|client)\b/,
    Personal: /\b(personal|family|health|fitness|home|life)\b/,
  };
  return Object.keys(map).filter((k) => map[k].test(t));
}

/* ----------------------- API (server Groq) ----------------------- */
export async function callAI(payload) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.includes("application/json")) throw new Error("API unavailable");
  return r.json();
}

/* ------------------------- date helpers -------------------------- */
export const pad = (n) => String(n).padStart(2, "0");
export function formatDue(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return "Today · " + time;
  if (d.toDateString() === tmr.toDateString()) return "Tomorrow · " + time;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + time;
}
// value for <input type="datetime-local"> from an ISO string (local time)
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Parse inline directives the user types in square brackets, e.g.
//   "Call the client [tomorrow 5pm high priority]"
// → { title: "Call the client", due: <ISO>, priority: "High", ... }
// The bracket text is stripped from the title; explicit values win over AI.
// Pull a date/time and priority out of natural task text — anywhere in the
// sentence, no brackets required. e.g. "Email Sam tomorrow at 5pm" →
// { title: "Email Sam", due: <ISO> }. The matched date phrase is stripped
// from the title; any [bracket] is still tolerated for backward-compat.
export function parseDirectives(raw) {
  const out = {};
  let title = raw.trim();

  const low = raw.toLowerCase();
  if (/\b(urgent|asap)\b/.test(low) || /high[-\s]?priority/.test(low)) out.priority = "High";
  else if (/low[-\s]?priority/.test(low) || /\b(whenever|someday)\b/.test(low)) out.priority = "Low";

  try {
    const results = chrono.parse(raw, new Date(), { forwardDate: true });
    if (results && results.length) {
      const r = results[0];
      const d = r.date();
      if (d) {
        out.due = d.toISOString();
        out.dateLabel = formatDue(out.due);
        out.overdue = d.getTime() < Date.now();
        // remove the matched date phrase from the title
        title = (raw.slice(0, r.index) + raw.slice(r.index + r.text.length));
      }
    }
  } catch (e) {}

  title = title
    .replace(/\s*\[[^\]]*\]\s*/g, " ") // drop any leftover brackets
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,]+$/g, "")
    .replace(/\b(by|on|at|due|before|around|for)\s*$/i, "") // dangling preposition
    .replace(/^[\s,-]+/, "")
    .trim();
  out.title = title || raw.trim();
  return out;
}

/* --------------------------- notifications ----------------------- */
// Show a notification via the service worker (works on mobile Chrome, where the
// plain `new Notification()` constructor is disallowed), falling back to the
// constructor on desktop browsers without an active SW.
export async function showNotify(title, body, tag) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, tag, icon: "/icon.svg", badge: "/icon.svg" });
      return true;
    }
  } catch (e) {}
  try {
    new Notification(title, { body, tag });
    return true;
  } catch (e) {
    return false;
  }
}

export function ensureNotifyPermission() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

export const numWord = (n) =>
  ({ 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine" }[n] || String(n));
export function shorten(title) {
  let s = title.charAt(0).toLowerCase() + title.slice(1);
  if (s.length > 26) s = s.slice(0, 25).trim() + "…";
  return s;
}
