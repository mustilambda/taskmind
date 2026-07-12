import { useEffect, useMemo, useRef, useState } from "react";
import * as chrono from "chrono-node";

/* ---------------------------------------------------------------- *
 * TaskMind — AI personal task organizer
 * - Per-browser data (localStorage); every visitor is isolated.
 * - Dynamic, AI-assigned categories: no fixed tabs. New users start
 *   empty; tabs appear only for categories the AI actually creates.
 * - Real sorting via /api/ai (Groq, server-side key). Falls back to a
 *   local keyword sorter when the API is unreachable (e.g. dev/offline).
 * ---------------------------------------------------------------- */

const STORAGE_KEY = "taskmind.v2";

const DEFAULT_STATE = {
  dark: false,
  tasks: [], // empty-first: brand new users see no tasks and no tabs
  savedContext: null,
  notify: { daily: true, overdue: true, priority: false },
  aiSummary: null, // { sig, line1, line2 } — funny+motivational home headline
  sync: { code: "", lastSyncedAt: 0 }, // private cross-device sync
  corrections: [], // { title, category, priority, at } — user fixes to AI calls, fed back as few-shot examples
};

// Fields that sync across devices (theme stays per-device on purpose).
const syncableData = (s) => ({
  tasks: Array.isArray(s.tasks) ? s.tasks : [],
  savedContext: s.savedContext || null,
  notify: { ...DEFAULT_STATE.notify, ...(s.notify || {}) },
  aiSummary: s.aiSummary || null,
  corrections: Array.isArray(s.corrections) ? s.corrections : [],
});

// Normalize data loaded from another device before merging it into local
// state. Older blobs predate some fields, and remote data must not be allowed
// to replace arrays/objects with malformed values.
function normalizeSyncedData(data) {
  const safe = data && typeof data === "object" ? data : {};
  return syncableData({ ...DEFAULT_STATE, ...safe });
}

const SYNC_WORDS_A = ["swift", "calm", "bright", "bold", "quiet", "lucky", "amber", "cobalt", "ember", "misty", "noble", "brisk"];
const SYNC_WORDS_B = ["otter", "falcon", "cedar", "harbor", "lantern", "pixel", "comet", "willow", "raven", "meadow", "quartz", "delta"];
function makeSyncCode() {
  const a = SYNC_WORDS_A[Math.floor(Math.random() * SYNC_WORDS_A.length)];
  const b = SYNC_WORDS_B[Math.floor(Math.random() * SYNC_WORDS_B.length)];
  return `${a}-${b}-${Math.floor(1000 + Math.random() * 9000)}`;
}
async function callSync(payload) {
  const r = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.includes("application/json")) throw new Error("sync unavailable");
  return r.json();
}

// Signature of the task state that the summary depends on. If it doesn't
// change, we keep the cached summary instead of spending another API call.
function summarySig(tasks) {
  return tasks.map((t) => `${t.id}:${t.done ? 1 : 0}:${t.category || ""}:${t.priority || ""}:${t.overdue ? 1 : 0}:${t.title}`).join("|");
}

const PROMPT =
  "I'm setting up TaskMind, a personal AI task organizer. Write a short profile of me (4–6 sentences) that it can use as context when sorting my tasks by category, priority, and due date.\n" +
  "Cover:\n" +
  "• my role and field\n" +
  "• the projects I'm working on right now\n" +
  "• the kinds of work I juggle (content, app dev, brand, research, admin, personal)\n" +
  "• my usual deadlines and what I treat as high priority\n" +
  "• how I like to work\n" +
  "Here's a bit about me: [WRITE A FEW WORDS ABOUT YOURSELF]\n" +
  "Return only the profile paragraph — nothing else.";

const NOTIF_DEFS = [
  { key: "daily", label: "Daily summary", desc: "A morning digest of what's due today." },
  { key: "overdue", label: "Overdue reminders", desc: "Nudge me when something slips past its date." },
  { key: "priority", label: "High-priority alerts", desc: "Ping me the moment a task is marked High." },
];

/* ---------------------------- theming ---------------------------- */
function palette(dark) {
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
const KNOWN_HUE = {
  Content: 258, "App Dev": 142, Brand: 22, Research: 212, Admin: 40, Personal: 45,
  Work: 200, Health: 160, Finance: 95, Home: 30, Learning: 280, Errands: 320,
};
function catColor(name, c) {
  let hue = KNOWN_HUE[name];
  if (hue == null) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    hue = h % 360;
  }
  return `hsl(${hue} ${c.catSat}% ${c.catLight}%)`;
}

/* ----------------- local fallback sorter (no API) ---------------- */
function classifyLocal(text) {
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
function detectCatsLocal(text) {
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
async function callAI(payload) {
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
const pad = (n) => String(n).padStart(2, "0");
function formatDue(iso) {
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
function toLocalInput(iso) {
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
function parseDirectives(raw) {
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
async function showNotify(title, body, tag) {
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

function ensureNotifyPermission() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

const numWord = (n) =>
  ({ 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine" }[n] || String(n));
function shorten(title) {
  let s = title.charAt(0).toLowerCase() + title.slice(1);
  if (s.length > 26) s = s.slice(0, 25).trim() + "…";
  return s;
}

/* ----------------------------- icons ----------------------------- */
const Moon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" fill="currentColor" />
  </svg>
);
const Sun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
    <circle cx={12} cy={12} r={4} />
    {[[12, 2, 12, 4], [12, 20, 12, 22], [2, 12, 4, 12], [20, 12, 22, 12], [4.9, 4.9, 6.3, 6.3], [17.7, 17.7, 19.1, 19.1], [4.9, 19.1, 6.3, 17.7], [17.7, 6.3, 19.1, 4.9]].map((l, i) => (
      <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />
    ))}
  </svg>
);
const Dots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);
const Close = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);
const Gear = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/* --------------------------- the app ----------------------------- */
export default function App() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...(saved && typeof saved === "object" ? saved : {}),
          tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
          notify: { ...DEFAULT_STATE.notify, ...(saved?.notify || {}) },
          corrections: Array.isArray(saved?.corrections) ? saved.corrections : [],
          sync: { ...DEFAULT_STATE.sync, ...(saved?.sync || {}) },
        };
      }
    } catch (e) {}
    return DEFAULT_STATE;
  });

  const [page, setPage] = useState("home");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [ctxMode, setCtxMode] = useState("ai");
  const [aiAbout, setAiAbout] = useState("");
  const [generating, setGenerating] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [manual, setManual] = useState({ name: "", role: "", focus: "" });
  const [newId, setNewId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [renamingCat, setRenamingCat] = useState(null);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | ok | error
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [, setTick] = useState(0); // forces a re-render each minute so overdue badges stay current

  const { dark, tasks, savedContext, notify, corrections } = state;
  const c = useMemo(() => palette(dark), [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);
  useEffect(() => {
    document.body.style.background = c.outer;
  }, [c]);

  // Re-render every minute so overdue badges appear as soon as a due time passes.
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  const enableNotifs = async () => {
    const p = await ensureNotifyPermission();
    setNotifPerm(p);
    if (p === "granted") {
      await showNotify("TaskMind", "Notifications are on ✓ I'll nudge you when a task is due.", "tm-test");
    }
  };


  // Fire a "due now" notification for any task whose time has arrived (while
  // the app is open). A poller — instead of one setTimeout per task — is robust
  // against re-renders, background-tab throttling, and granting permission
  // after load: it checks every 20s and whenever the window regains focus,
  // and a ref tracks what's already been notified so nothing double-fires.
  const notifiedRef = useRef(new Set());
  useEffect(() => {
    const check = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (!notify.overdue && !notify.priority && !notify.daily) return;
      const now = Date.now();
      tasks.forEach((t) => {
        if (t.done || !t.due || notifiedRef.current.has(t.id)) return;
        const at = new Date(t.due).getTime();
        if (at <= now && now - at < 1000 * 60 * 60 * 12) {
          // due within the last 12h and not yet notified → fire once
          notifiedRef.current.add(t.id);
          showNotify("TaskMind", `Due now: ${t.title}`, "tm-" + t.id);
        }
      });
    };
    check();
    const i = setInterval(check, 20000);
    window.addEventListener("focus", check);
    return () => { clearInterval(i); window.removeEventListener("focus", check); };
  }, [tasks, notify, notifPerm]);

  // If a task's due time is edited to the future again, allow it to re-notify.
  useEffect(() => {
    const now = Date.now();
    tasks.forEach((t) => {
      if (t.due && new Date(t.due).getTime() > now) notifiedRef.current.delete(t.id);
    });
  }, [tasks]);

  /* --------------------------- sync ---------------------------- */
  const code = state.sync?.code || "";
  const pushTimer = useRef();
  const lastPushedSig = useRef("");

  const pushNow = async () => {
    if (!code) return;
    const data = syncableData(state);
    const sig = JSON.stringify(data);
    setSyncState("syncing");
    try {
      const out = await callSync({ action: "push", code, data });
      lastPushedSig.current = sig;
      setState((s) => ({ ...s, sync: { ...s.sync, lastSyncedAt: out.updatedAt } }));
      setSyncState("ok");
    } catch (e) {
      setSyncState("error");
    }
  };

  const pullNow = async () => {
    if (!code) return;
    setSyncState("syncing");
    try {
      const out = await callSync({ action: "pull", code });
      if (out.blob && out.blob.data) {
        const remote = normalizeSyncedData(out.blob.data);
        setState((s) => {
          if ((out.blob.updatedAt || 0) <= (s.sync?.lastSyncedAt || 0)) return s;
          lastPushedSig.current = JSON.stringify(remote);
          return { ...s, ...remote, sync: { ...s.sync, lastSyncedAt: out.blob.updatedAt } };
        });
      }
      setSyncState("ok");
    } catch (e) {
      setSyncState("error");
    }
  };

  // Create a new code (seed remote with local data) or join an existing one
  // (adopt remote data onto this device).
  const connectSync = async (rawCode) => {
    const c = (rawCode || "").trim().toLowerCase();
    if (!c) return;
    setSyncState("syncing");
    try {
      const out = await callSync({ action: "pull", code: c });
      if (out.blob && out.blob.data) {
        const remote = normalizeSyncedData(out.blob.data);
        lastPushedSig.current = JSON.stringify(remote);
        setState((s) => ({ ...s, ...remote, sync: { code: c, lastSyncedAt: out.blob.updatedAt || Date.now() } }));
      } else {
        const data = syncableData(state);
        const push = await callSync({ action: "push", code: c, data });
        lastPushedSig.current = JSON.stringify(data);
        setState((s) => ({ ...s, sync: { code: c, lastSyncedAt: push.updatedAt } }));
      }
      setSyncState("ok");
    } catch (e) {
      setSyncState("error");
    }
  };

  const disconnectSync = () => {
    setState((s) => ({ ...s, sync: { code: "", lastSyncedAt: 0 } }));
    setSyncState("idle");
  };

  // Pull on mount and whenever the window regains focus (e.g. switching back).
  useEffect(() => {
    if (!code) return;
    pullNow();
    const onFocus = () => pullNow();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Debounced push whenever the synced data actually changes.
  useEffect(() => {
    if (!code) return;
    const sig = JSON.stringify(syncableData(state));
    if (sig === lastPushedSig.current) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushNow(), 1200);
    return () => clearTimeout(pushTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, state.savedContext, state.notify, state.aiSummary, state.corrections, code]);

  /* ------------------------- mutations ------------------------- */
  const addTask = async () => {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    // Pull any [bracketed] scheduling/priority directives out of the text first.
    const dir = parseDirectives(text);
    const title = dir.title;
    const overrides = {};
    if (dir.priority) overrides.priority = dir.priority;
    if (dir.due) { overrides.due = dir.due; overrides.dateLabel = dir.dateLabel; overrides.overdue = dir.overdue; }

    setNewId(id);
    setState((s) => ({ ...s, tasks: [{ id, title, done: false, pending: true }, ...s.tasks] }));
    setDraft("");
    if (dir.due) ensureNotifyPermission();

    const existing = [...new Set(tasks.map((t) => t.category).filter(Boolean))];
    // Feed the AI's own recent corrections back as few-shot examples so it
    // stops repeating fixes the user already made once.
    const recentCorrections = (corrections || []).slice(-12).map((c2) => ({ title: c2.title, category: c2.category, priority: c2.priority }));
    let result;
    try {
      result = await callAI({ action: "classify", text: title, context: savedContext?.text || "", existingCategories: existing, corrections: recentCorrections });
    } catch (e) {
      result = classifyLocal(title);
    }
    // Explicit bracket directives win over the AI's guesses.
    const merged = { ...result, ...overrides };
    if (overrides.due) merged.reason = result.reason || ("Scheduled for " + dir.dateLabel + ".");
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...merged, pending: false } : t)) }));
  };
  // Manual edit: lets the user fix the AI's call — category, priority,
  // timing, and description — and saves it straight to localStorage.
  const updateTask = (id, fields) => {
    let next = { ...fields };
    if ("due" in fields) {
      if (fields.due) {
        next.dateLabel = formatDue(fields.due);
        next.overdue = new Date(fields.due).getTime() < Date.now();
      } else {
        next.dateLabel = next.dateLabel || "No date";
        next.overdue = false;
      }
    }
    setState((s) => {
      const task = s.tasks.find((x) => x.id === id);
      // The user overrode the AI's category/priority call — remember the
      // corrected pairing so future classify calls learn from it.
      const corrected = task && (
        ("category" in next && next.category && next.category !== task.category) ||
        ("priority" in next && next.priority && next.priority !== task.priority)
      );
      const learned = Array.isArray(s.corrections) ? s.corrections : [];
      const corrections = corrected
        ? [...learned, { title: task.title, category: next.category || task.category, priority: next.priority || task.priority, at: Date.now() }].slice(-40)
        : learned;
      return { ...s, corrections, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...next } : x)) };
    });
    if (next.due) ensureNotifyPermission();
  };
  // Rename a category/tab everywhere it appears.
  const renameCategory = (from, to) => {
    const name = (to || "").trim();
    if (!name || name === from) return;
    setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.category === from ? { ...x, category: name } : x)) }));
    setFilter((f) => (f === from ? name : f));
  };
  const toggle = (id) => setState((s) => {
    const task = s.tasks.find((x) => x.id === id);
    if (!task) return s;
    const nowDone = !task.done;

    // When completing a recurring task, spawn the next occurrence.
    let extra = [];
    if (nowDone && task.repeat && task.repeat !== "none" && task.due) {
      const next = new Date(task.due);
      if (task.repeat === "daily") next.setDate(next.getDate() + 1);
      else if (task.repeat === "weekly") next.setDate(next.getDate() + 7);
      else if (task.repeat === "monthly") next.setMonth(next.getMonth() + 1);
      // If the computed next date is already past, advance to the same time tomorrow / next week / next month from now.
      if (next.getTime() < Date.now()) {
        const now = new Date();
        if (task.repeat === "daily") { next.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + 1); }
        else if (task.repeat === "weekly") { next.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + 7); }
        else if (task.repeat === "monthly") { next.setFullYear(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
      }
      const due = next.toISOString();
      extra = [{ ...task, id: Date.now(), done: false, due, dateLabel: formatDue(due), overdue: false }];
    }

    return { ...s, tasks: [...extra, ...s.tasks.map((x) => (x.id === id ? { ...x, done: nowDone } : x))] };
  });

  const snoozeTask = (id, amount) => {
    setState((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return s;
      let next;
      if (amount === "tomorrow") {
        next = new Date();
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
      } else {
        next = new Date(Date.now() + amount * 60 * 60 * 1000);
      }
      const due = next.toISOString();
      return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, due, dateLabel: formatDue(due), overdue: false } : t)) };
    });
  };
  const remove = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id) }));
  const setDark = (v) => setState((s) => ({ ...s, dark: v }));
  const toggleNotify = (key) => {
    setState((s) => {
      const on = !s.notify[key];
      if (on) ensureNotifyPermission();
      return { ...s, notify: { ...s.notify, [key]: on } };
    });
  };
  const clearContext = () => setState((s) => ({ ...s, savedContext: null }));
  const resetLearning = () => setState((s) => ({ ...s, corrections: [] }));

  const generateProfile = async () => {
    const about = aiAbout.trim();
    if (!about || generating) return;
    setGenerating(true);
    try {
      const out = await callAI({ action: "profile", about });
      setState((s) => ({ ...s, savedContext: { text: out.text, source: "AI generated", cats: out.cats || [] } }));
    } catch (e) {
      // fallback: store the raw words, detect cats locally
      setState((s) => ({ ...s, savedContext: { text: about, source: "Saved", cats: detectCatsLocal(about) } }));
    } finally {
      setGenerating(false);
    }
  };
  const copyPrompt = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(PROMPT); } catch (e) {}
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };
  const savePasted = () => {
    const text = pasteText.trim();
    if (!text) return;
    // keep pasteText so the same summary stays available for re-editing
    setState((s) => ({ ...s, savedContext: { text, source: "AI summary", cats: detectCatsLocal(text) } }));
  };
  // Editing saved context preloads the existing text so the user can reuse
  // or tweak the same summary instead of starting from a blank box.
  const editContext = () => {
    if (savedContext) {
      setCtxMode("ai");
      setPasteText(savedContext.text || "");
    }
    setState((s) => ({ ...s, savedContext: null }));
  };
  const saveManual = () => {
    const { name, role, focus } = manual;
    if (!role.trim() && !focus.trim() && !name.trim()) return;
    const parts = [];
    if (name.trim()) parts.push(name.trim());
    if (role.trim()) parts.push(role.trim());
    let text = parts.join(" — ");
    if (focus.trim()) text += (text ? ". " : "") + "Currently focused on " + focus.trim().replace(/\.$/, "") + ".";
    setState((s) => ({ ...s, savedContext: { text, source: "Written manually", cats: detectCatsLocal(role + " " + focus), name: name.trim() } }));
  };

  /* ------------------------- derived --------------------------- */
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => (t.due ? new Date(t.due).getTime() < Date.now() : t.overdue));
  const high = open.filter((t) => t.priority === "High");
  const doneCount = tasks.filter((t) => t.done).length;
  const isFresh = tasks.length === 0;

  let head1, head2;
  if (isFresh) {
    head1 = "What's on your mind?";
    head2 = "Add a task — I'll sort it for you.";
  } else if (open.length === 0) {
    head1 = "All " + tasks.length + " tasks complete.";
    head2 = doneCount + " done today — nothing left.";
  } else {
    const parts = [];
    if (overdue.length) parts.push(overdue.length + " overdue");
    if (high.length) parts.push(high.length + " high priority");
    const rest = open.length - overdue.length - high.filter(t => !overdue.includes(t)).length;
    if (rest > 0) parts.push(rest + " other");
    head1 = open.length + " open task" + (open.length !== 1 ? "s" : "") + (doneCount ? " · " + doneCount + " done" : "") + ".";
    head2 = overdue.length
      ? overdue.length + " overdue · next up: " + shorten(overdue[0].title) + "."
      : high.length
      ? high.length + " high priority · next up: " + shorten(high[0].title) + "."
      : "Next up: " + shorten(open[0].title) + ".";
  }

  const subline = isFresh
    ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + doneCount + " of " + tasks.length + " done";

  // dynamic tabs: only categories that actually exist among the tasks
  const cats = [...new Set(tasks.map((t) => t.category).filter(Boolean))];
  const filterKeys = ["today", "all", ...cats];
  const todayStr = new Date().toDateString();
  const visible =
    filter === "today"
      ? tasks.filter((t) => !t.done && t.due && (new Date(t.due).toDateString() === todayStr || new Date(t.due).getTime() < Date.now()))
      : filter === "all" || !filterKeys.includes(filter)
      ? tasks
      : tasks.filter((t) => t.category === filter);

  return (
    <div className="tm-outer" style={{ background: c.outer }}>
      <div
        className="tmx tm-card"
        style={{ background: c.bg, borderColor: c.frame, color: c.text }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: c.bg, padding: "22px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="serif" style={{ fontSize: 26, fontStyle: "italic", letterSpacing: "-0.01em" }}>TaskMind</div>
          <div style={{ display: "flex", gap: 8 }}>
            <IconBtn c={c} onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</IconBtn>
            <IconBtn c={c} onClick={() => setPage(page === "home" ? "settings" : "home")} active={page === "settings"}>
              {page === "settings" ? <Close /> : <Gear />}
            </IconBtn>
          </div>
        </div>

        {page === "home" ? (
          <Home
            c={c} head1={head1} head2={head2} subline={subline} draft={draft} setDraft={setDraft} addTask={addTask}
            filter={filter} setFilter={setFilter} filterKeys={filterKeys} visible={visible} newId={newId}
            toggle={toggle} remove={remove} isFresh={isFresh}
            onEditTask={setEditingId} onRenameCat={setRenamingCat} snoozeTask={snoozeTask}
            openCount={open.length} doneCount={doneCount} totalCount={tasks.length} overdueCount={overdue.length} highCount={high.length}
          />
        ) : (
          <Settings
            c={c} dark={dark} setDark={setDark} ctxMode={ctxMode} setCtxMode={setCtxMode} savedContext={savedContext}
            clearContext={editContext} aiAbout={aiAbout} setAiAbout={setAiAbout} generating={generating}
            generateProfile={generateProfile} manual={manual} setManual={setManual} saveManual={saveManual}
            promptCopied={promptCopied} copyPrompt={copyPrompt} pasteText={pasteText} setPasteText={setPasteText} savePasted={savePasted}
            notify={notify} toggleNotify={toggleNotify} notifPerm={notifPerm} enableNotifs={enableNotifs}
            syncCode={code} syncState={syncState} lastSyncedAt={state.sync?.lastSyncedAt}
            connectSync={connectSync} disconnectSync={disconnectSync} pullNow={pullNow}
            corrections={corrections} resetLearning={resetLearning}
          />
        )}

        <div style={{ textAlign: "center", padding: "26px 0 30px", fontSize: 11.5, color: c.faint }}>
          TaskMind · made for the way you work
        </div>

        {editingId != null && (
          <TaskEditor
            c={c}
            task={tasks.find((t) => t.id === editingId)}
            categories={[...new Set(tasks.map((t) => t.category).filter(Boolean))]}
            onSave={(fields) => { updateTask(editingId, fields); setEditingId(null); }}
            onClose={() => setEditingId(null)}
          />
        )}
        {renamingCat != null && (
          <CategoryRename
            c={c}
            name={renamingCat}
            onSave={(to) => { renameCategory(renamingCat, to); setRenamingCat(null); }}
            onClose={() => setRenamingCat(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- modals ---------------------------- */
function Overlay({ c, children, onClose }) {
  return (
    <div
      onClick={onClose}
      className="tm-modal-backdrop"
      style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", background: c.bg, borderRadius: "22px 22px 30px 30px", border: "1px solid " + c.frame, borderBottom: "none", padding: "20px 22px 26px", animation: "tmIn .2s ease both", maxHeight: "90%", overflowY: "auto" }}
        className="tmx"
      >
        {children}
      </div>
    </div>
  );
}

function TaskEditor({ c, task, categories, onSave, onClose }) {
  const [title, setTitle] = useState(task.title || "");
  const [category, setCategory] = useState(task.category || "");
  const [priority, setPriority] = useState(task.priority || "Medium");
  const [reason, setReason] = useState(task.reason || "");
  const [due, setDue] = useState(toLocalInput(task.due));
  const [repeat, setRepeat] = useState(task.repeat || "none");

  const input = { width: "100%", border: "1px solid " + c.line, borderRadius: 11, background: c.card, padding: "11px 13px", fontFamily: "inherit", fontSize: 13.5, color: c.text, outline: "none" };
  const seg = { flex: 1, cursor: "pointer", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "9px 0", transition: "all .15s" };

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      category: category.trim(),
      priority,
      reason: reason.trim(),
      due: due ? new Date(due).toISOString() : "",
      repeat,
    });
  };

  return (
    <Overlay c={c} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="serif" style={{ fontSize: 22, fontStyle: "italic" }}>Edit task</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.sub }}><Close /></button>
      </div>

      <Lbl c={c}>Task</Lbl>
      <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, resize: "vertical", lineHeight: 1.4 }} />

      <Lbl c={c}>Category</Lbl>
      <input list="tm-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Work, Health, Errands" style={input} />
      <datalist id="tm-cats">{categories.map((k) => <option key={k} value={k} />)}</datalist>

      <Lbl c={c}>Priority</Lbl>
      <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 10, padding: 4 }}>
        {["High", "Medium", "Low"].map((p) => {
          const on = priority === p;
          return (
            <button key={p} onClick={() => setPriority(p)} style={{ ...seg, background: on ? c.segActive : "transparent", color: on ? (c.pris[p] || c.text) : c.sub, boxShadow: on ? "0 1px 3px rgba(0,0,0,0.13)" : "none" }}>
              {p}
            </button>
          );
        })}
      </div>

      <Lbl c={c}>Due date &amp; time</Lbl>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...input, flex: 1, colorScheme: "light dark" }} />
        {due && <button onClick={() => setDue("")} style={{ border: "1px solid " + c.line, background: "transparent", color: c.sub, borderRadius: 11, cursor: "pointer", padding: "0 12px", fontFamily: "inherit", fontSize: 12.5 }}>Clear</button>}
      </div>
      <div style={{ fontSize: 11, color: c.faint, marginTop: 6 }}>You'll get a notification at this time (while TaskMind is open).</div>

      <Lbl c={c}>Repeat</Lbl>
      <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 10, padding: 4 }}>
        {[["none", "None"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([val, label]) => {
          const on = repeat === val;
          return (
            <button key={val} onClick={() => setRepeat(val)} style={{ ...seg, flex: 1, background: on ? c.segActive : "transparent", color: on ? c.text : c.sub, boxShadow: on ? "0 1px 3px rgba(0,0,0,0.13)" : "none" }}>
              {label}
            </button>
          );
        })}
      </div>
      {repeat !== "none" && !due && (
        <div style={{ fontSize: 11, color: c.accent, marginTop: 6 }}>Set a due date so the next occurrence can be scheduled.</div>
      )}

      <Lbl c={c}>Note</Lbl>
      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this matters, context, anything…" style={{ ...input, resize: "vertical", lineHeight: 1.4 }} />

      <button onClick={save} style={{ marginTop: 18, width: "100%", border: "none", borderRadius: 12, cursor: "pointer", background: c.accent, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "13px 0" }}>
        Save changes
      </button>
    </Overlay>
  );
}

function CategoryRename({ c, name, onSave, onClose }) {
  const [value, setValue] = useState(name);
  return (
    <Overlay c={c} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="serif" style={{ fontSize: 22, fontStyle: "italic" }}>Rename tab</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.sub }}><Close /></button>
      </div>
      <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 12 }}>Renames “{name}” on every task in it.</div>
      <input
        autoFocus value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(value); }}
        style={{ width: "100%", border: "1px solid " + c.line, borderRadius: 11, background: c.card, padding: "12px 14px", fontFamily: "inherit", fontSize: 14, color: c.text, outline: "none" }}
      />
      <button onClick={() => onSave(value)} style={{ marginTop: 16, width: "100%", border: "none", borderRadius: 12, cursor: "pointer", background: c.accent, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "13px 0" }}>
        Save
      </button>
    </Overlay>
  );
}

function Lbl({ c, children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 600, color: c.text, opacity: 0.8, margin: "16px 0 6px" }}>{children}</div>;
}

/* ----------------------- small components ------------------------ */
function IconBtn({ c, onClick, children, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 36, borderRadius: 11, cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", color: active ? c.text : c.sub,
        background: active ? c.segActive : "transparent", border: "1px solid " + c.line, transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}

function Home({ c, head1, head2, subline, draft, setDraft, addTask, filter, setFilter, filterKeys, visible, newId, toggle, remove, isFresh, onEditTask, onRenameCat, snoozeTask, openCount, doneCount, totalCount, overdueCount, highCount }) {
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const suggestions = ["Today", "High priority", "Tomorrow 9am"];
  return (
    <div className="tm-home">
      <section className="tm-hero" style={{ background: `linear-gradient(145deg, ${c.card}, ${c.bg})`, borderColor: c.line }}>
        <div className="tm-hero-copy">
          <div className="tm-eyebrow" style={{ color: c.accent }}>{subline}</div>
          <div className="serif tm-headline">{head1}</div>
          <div className="serif tm-headline tm-headline-muted" style={{ color: c.sub }}>{head2}</div>
        </div>
        <div className="tm-progress-orb" style={{ background: `conic-gradient(${c.accent} ${progress}%, ${c.line} 0)` }} aria-label={`${progress}% complete`}>
          <div style={{ background: c.bg }}><strong>{progress}%</strong><span>done</span></div>
        </div>
        {!isFresh && <div className="tm-stats">
          <div><strong>{openCount}</strong><span>open</span></div>
          <div><strong style={{ color: overdueCount ? c.overdue : c.text }}>{overdueCount}</strong><span>overdue</span></div>
          <div><strong style={{ color: highCount ? c.pris.High : c.text }}>{highCount}</strong><span>high priority</span></div>
        </div>}
      </section>

      <section className="tm-capture" style={{ background: c.card, borderColor: draft.trim() ? c.accent : c.line }}>
        <div className="tm-ai-mark" style={{ background: c.accent, color: "#fff" }}>✦</div>
        <textarea
          rows={1} value={draft} placeholder="Tell TaskMind what needs doing…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTask(); } }}
          aria-label="Add a task"
          style={{ color: c.text }}
        />
        <button
          onClick={addTask}
          disabled={!draft.trim()}
          className="tm-organize-btn"
          style={{ cursor: draft.trim() ? "pointer" : "default", background: draft.trim() ? c.accent : c.line, color: draft.trim() ? "#fff" : c.faint }}
        >
          Organize <span>→</span>
        </button>
        <div className="tm-suggestion-row">
          <span style={{ color: c.faint }}>Try</span>
          {suggestions.map((label) => <button key={label} onClick={() => setDraft((v) => `${v}${v ? " " : ""}${label.toLowerCase()}`)} style={{ color: c.sub, borderColor: c.line }}>{label}</button>)}
        </div>
      </section>

      {filterKeys.length > 0 && (
        <div className="tmx tm-tabs" style={{ borderColor: c.line }}>
          {filterKeys.map((k) => (
            <Tab key={k} c={c} k={k} active={filter === k} onSelect={() => setFilter(k)} onRename={() => onRenameCat(k)} />
          ))}
        </div>
      )}

      <div className="tm-task-list">
        {visible.length === 0 ? (
          <div className="tm-empty" style={{ background: c.card, borderColor: c.line }}>
            <div className="tm-empty-icon" style={{ color: c.accent, background: `${c.accent}14` }}>✦</div>
            <div className="serif">{isFresh ? "A clear mind starts here." : "Everything is clear here."}</div>
            <p style={{ color: c.sub }}>{isFresh ? "Add your first task above. Include a date or priority and I’ll handle the rest." : "No tasks match this view. Enjoy the breathing room."}</p>
            {isFresh && <button onClick={() => setDraft("Plan my week tomorrow at 9am")} style={{ color: c.accent, borderColor: c.line }}>Use an example</button>}
          </div>
        ) : (
          visible.map((t, i) => (
            <TaskRow key={t.id} t={t} last={i === visible.length - 1} c={c} newId={newId} toggle={toggle} remove={remove} onEdit={() => onEditTask(t.id)} snoozeTask={snoozeTask} />
          ))
        )}
      </div>
    </div>
  );
}

// Reusable ⋯ dropdown. `align` controls which side it opens toward.
function Menu({ c, items, align = "right", trigger, btnStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={btnStyle || { background: "none", border: "none", cursor: "pointer", color: c.sub, display: "flex", alignItems: "center", padding: 2 }}
        aria-label="More options"
      >
        {trigger || <Dots />}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", [align]: 0, marginTop: 4, zIndex: 30, minWidth: 130,
            background: c.bg, border: "1px solid " + c.frame, borderRadius: 12, padding: 5,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)", animation: "tmIn .12s ease both",
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500, padding: "9px 11px",
                borderRadius: 8, color: it.danger ? c.accent : c.text,
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Tab({ c, k, active, onSelect, onRename }) {
  const isSpecial = k === "all" || k === "today";
  const label = k === "all" ? "All" : k === "today" ? "Today" : k;
  return (
    <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, paddingBottom: 9, borderBottom: "1.5px solid " + (active ? c.accent : "transparent") }}>
      <button
        onClick={onSelect}
        style={{
          cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", fontSize: 12.5,
          padding: 0, whiteSpace: "nowrap", transition: "all .15s",
          color: active ? c.text : c.sub, fontWeight: active ? 600 : 450,
        }}
      >
        {label}
      </button>
      {!isSpecial && (
        <button
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          title="Rename tab"
          aria-label="Rename tab"
          style={{ background: "none", border: "none", cursor: "pointer", color: active ? c.sub : c.faint, display: "flex", alignItems: "center", padding: 0, opacity: 0.85 }}
        >
          <Dots />
        </button>
      )}
    </span>
  );
}

const REPEAT_LABEL = { daily: "↻ Daily", weekly: "↻ Weekly", monthly: "↻ Monthly" };

function TaskRow({ t, last, c, newId, toggle, remove, onEdit, snoozeTask }) {
  const cColor = t.category ? catColor(t.category, c) : c.sub;
  const priColor = c.pris[t.priority] || c.sub;
  // Compute overdue live from the real due time when present, so it flips on
  // as soon as the scheduled moment passes (falls back to the stored flag).
  const isOverdue = !t.done && (t.due ? new Date(t.due).getTime() < Date.now() : !!t.overdue);
  // Recompute the date label live from the real timestamp so "Tomorrow" rolls
  // over to "Today" automatically. Fall back to the stored label only when
  // there's no concrete due time (e.g. AI hints like "This weekend").
  const dateText = t.due ? formatDue(t.due) : t.dateLabel;
  return (
    <div
      className="tm-task"
      style={{
        background: c.card, borderColor: isOverdue ? `${c.overdue}55` : c.line,
        display: "flex", gap: 13, alignItems: "flex-start",
        animation: t.id === newId ? "tmIn .25s ease both" : undefined,
        opacity: t.done ? 0.58 : 1,
      }}
    >
      <button
        className="tm-check"
        onClick={() => !t.pending && toggle(t.id)}
        aria-label={t.done ? "Mark task incomplete" : "Complete task"}
        style={{
          cursor: t.pending ? "default" : "pointer",
          background: t.done ? c.green : "transparent", border: "1.5px solid " + (t.done ? c.green : c.checkBorder),
        }}
      >
        {t.done && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 450, lineHeight: 1.35, letterSpacing: "-0.005em", color: t.done ? c.faint : c.text, textDecoration: t.done ? "line-through" : "none" }}>
          {t.title}
        </div>
        {t.pending ? (
          <div style={{ marginTop: 7, fontSize: 11.5, color: c.faint, fontStyle: "italic" }}>TaskMind is sorting this…</div>
        ) : (
          <>
            <div className="tm-task-meta">
              {t.category && (
                <span className="tm-pill" style={{ color: cColor, background: `${cColor}12` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cColor }} />
                  {t.category}
                </span>
              )}
              {t.priority && <span className="tm-pill" style={{ color: priColor, background: `${priColor}12` }}>{t.priority}</span>}
              {dateText && <span className="tm-pill" style={{ color: isOverdue ? c.overdue : c.sub, background: isOverdue ? `${c.overdue}12` : "transparent" }}>{dateText}</span>}
              {isOverdue && (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", color: "#fff", background: c.overdue, padding: "2px 8px", borderRadius: 50, textTransform: "uppercase" }}>
                  ⚠ Overdue
                </span>
              )}
              {t.repeat && t.repeat !== "none" && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: c.sub }}>{REPEAT_LABEL[t.repeat]}</span>
              )}
            </div>
            {!t.done && t.reason && <div style={{ marginTop: 6, fontSize: 11.5, color: c.faint, lineHeight: 1.4 }}>{t.reason}</div>}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <Menu
          c={c}
          items={[
            ...(t.pending ? [] : [{ label: "Edit", onClick: onEdit }]),
            ...(isOverdue && !t.pending ? [
              { label: "Snooze 1 hour", onClick: () => snoozeTask(t.id, 1) },
              { label: "Snooze to tomorrow", onClick: () => snoozeTask(t.id, "tomorrow") },
            ] : []),
            { label: "Delete", onClick: () => remove(t.id), danger: true },
          ]}
          btnStyle={{ background: "none", border: "none", cursor: "pointer", color: c.delete, display: "flex", alignItems: "center", padding: 2 }}
        />
      </div>
    </div>
  );
}

/* ----------------------------- settings -------------------------- */
function Settings(props) {
  const {
    c, dark, setDark, ctxMode, setCtxMode, savedContext, clearContext, aiAbout, setAiAbout, generating,
    generateProfile, manual, setManual, saveManual, promptCopied, copyPrompt, pasteText, setPasteText, savePasted,
    notify, toggleNotify, notifPerm, enableNotifs, syncCode, syncState, lastSyncedAt, connectSync, disconnectSync, pullNow,
    corrections, resetLearning,
  } = props;

  const segBase = { flex: 1, cursor: "pointer", border: "none", borderRadius: 9, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, padding: "9px 0", transition: "all .15s" };
  const segOn = { background: c.segActive, color: c.text, boxShadow: "0 1px 3px rgba(0,0,0,0.13)" };
  const segOff = { background: "transparent", color: c.sub };
  const inputStyle = { width: "100%", border: "1px solid " + c.line, borderRadius: 12, background: c.card, padding: "12px 14px", fontFamily: "inherit", fontSize: 13.5, color: c.text, outline: "none" };
  const primaryBtn = (enabled) => ({ marginTop: 12, width: "100%", cursor: enabled ? "pointer" : "default", border: "none", borderRadius: 11, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "11px 18px", transition: "all .15s", background: enabled ? c.accent : c.seg, color: enabled ? "#fff" : c.faint });

  return (
    <div style={{ padding: "10px 24px 0" }}>
      <div className="serif" style={{ fontSize: 28, fontStyle: "italic", paddingTop: 8 }}>Settings</div>

      <Section c={c} title="About you" sub="Give TaskMind context about your work so it sorts new tasks the way you actually work.">
        {savedContext ? (
          <div style={{ background: c.card, border: "1px solid " + c.line, borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: c.green }}>Context saved · {savedContext.source}</span>
              <button onClick={clearContext} style={{ background: "none", border: "none", cursor: "pointer", color: c.accent, fontSize: 12, fontWeight: 600 }}>Edit</button>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.text }}>{savedContext.text}</div>
            {savedContext.cats && savedContext.cats.length > 0 && (
              <>
                <div style={{ marginTop: 12, fontSize: 11, color: c.faint }}>Understood your focus</div>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {savedContext.cats.map((k) => {
                    const col = catColor(k, c);
                    return (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 500, color: col, background: c.card, border: "1px solid " + c.line, padding: "5px 11px", borderRadius: 20 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: col }} />
                        {k}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 11, padding: 4, marginBottom: 14 }}>
              <button onClick={() => setCtxMode("ai")} style={{ ...segBase, ...(ctxMode === "ai" ? segOn : segOff) }}>Generate with AI</button>
              <button onClick={() => setCtxMode("manual")} style={{ ...segBase, ...(ctxMode === "manual" ? segOn : segOff) }}>Write manually</button>
            </div>

            {ctxMode === "ai" ? (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Tell me about yourself</div>
                <div style={{ fontSize: 12, color: c.sub, marginBottom: 10 }}>A few words is enough — your role, what you're working on, what you juggle. TaskMind writes the rest.</div>
                <textarea rows={4} value={aiAbout} onChange={(e) => setAiAbout(e.target.value)} placeholder="e.g. indie designer shipping a mobile app, writing a weekly newsletter, plus the usual admin and family stuff" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
                <button onClick={generateProfile} disabled={!aiAbout.trim() || generating} style={primaryBtn(!!aiAbout.trim() && !generating)}>
                  {generating ? "Generating…" : "Generate with AI"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 16px", color: c.faint, fontSize: 11.5 }}>
                  <span style={{ flex: 1, height: 1, background: c.line }} />
                  or bring your own LLM
                  <span style={{ flex: 1, height: 1, background: c.line }} />
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Copy this prompt</div>
                <div style={{ fontSize: 12, color: c.sub, marginBottom: 10 }}>Paste it into ChatGPT, Claude, or any LLM you like.</div>
                <div style={{ background: c.card, border: "1px solid " + c.line, borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.5, color: c.sub, whiteSpace: "pre-wrap" }}>{PROMPT}</div>
                <button
                  onClick={copyPrompt}
                  style={{ marginTop: 11, cursor: "pointer", border: "1px solid " + c.line, borderRadius: 10, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "9px 15px", transition: "all .15s", background: promptCopied ? c.green : "transparent", color: promptCopied ? "#fff" : c.text }}
                >
                  {promptCopied ? "Copied ✓" : "Copy prompt"}
                </button>

                <div style={{ marginTop: 20, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Paste the summary back</div>
                <div style={{ fontSize: 12, color: c.sub, marginBottom: 10 }}>Drop the LLM's reply here and TaskMind will learn your context.</div>
                <textarea rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the profile paragraph…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
                <button onClick={savePasted} disabled={!pasteText.trim()} style={primaryBtn(!!pasteText.trim())}>Save context</button>
              </div>
            ) : (
              <div>
                <Field label="Your name"><input value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} placeholder="Sam Rivera" style={inputStyle} /></Field>
                <Field label="What you do"><input value={manual.role} onChange={(e) => setManual((m) => ({ ...m, role: e.target.value }))} placeholder="Indie product designer & developer" style={inputStyle} /></Field>
                <Field label="Focus areas & current projects"><textarea rows={3} value={manual.focus} onChange={(e) => setManual((m) => ({ ...m, focus: e.target.value }))} placeholder="Shipping a mobile app, writing a weekly newsletter…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} /></Field>
                <button onClick={saveManual} disabled={!(manual.role.trim() || manual.focus.trim() || manual.name.trim())} style={primaryBtn(!!(manual.role.trim() || manual.focus.trim() || manual.name.trim()))}>Save context</button>
              </div>
            )}
          </>
        )}
      </Section>

      <Section c={c} title="Learning" sub={corrections.length ? "TaskMind remembers the sorting you've corrected and reuses those calls on similar tasks." : "Correct a task's category or priority and TaskMind will remember the fix for similar tasks later."}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: c.card, border: "1px solid " + c.line, borderRadius: 14, padding: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{corrections.length} correction{corrections.length !== 1 ? "s" : ""} learned</div>
            {corrections.length > 0 && (
              <div style={{ fontSize: 12, color: c.sub, marginTop: 3 }}>Last: “{shorten(corrections[corrections.length - 1].title)}” → {corrections[corrections.length - 1].category}</div>
            )}
          </div>
          {corrections.length > 0 && (
            <button onClick={resetLearning} style={{ flexShrink: 0, cursor: "pointer", border: "1px solid " + c.line, borderRadius: 9, background: "transparent", color: c.accent, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 12px" }}>
              Reset
            </button>
          )}
        </div>
      </Section>

      <Section c={c} title="Appearance">
        <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 11, padding: 4 }}>
          <button onClick={() => setDark(false)} style={{ ...segBase, ...(!dark ? segOn : segOff) }}>☀ Light</button>
          <button onClick={() => setDark(true)} style={{ ...segBase, ...(dark ? segOn : segOff) }}>☾ Dark</button>
        </div>
      </Section>

      <Section c={c} title="Notifications">
        <PermBanner c={c} notifPerm={notifPerm} enableNotifs={enableNotifs} />
        {NOTIF_DEFS.map((n, i) => (
          <div key={n.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 0", borderTop: i === 0 ? "none" : "1px solid " + c.line }}>
            <div style={{ paddingRight: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{n.label}</div>
              <div style={{ fontSize: 12, color: c.sub, marginTop: 3 }}>{n.desc}</div>
            </div>
            <Toggle c={c} on={notify[n.key]} onClick={() => toggleNotify(n.key)} />
          </div>
        ))}
      </Section>

      <Section c={c} title="Sync across devices" sub="Use one private code on your phone and PC to keep tasks in sync. No account — keep the code to yourself.">
        <SyncSection c={c} syncCode={syncCode} syncState={syncState} lastSyncedAt={lastSyncedAt} connectSync={connectSync} disconnectSync={disconnectSync} pullNow={pullNow} />
      </Section>
    </div>
  );
}

function PermBanner({ c, notifPerm, enableNotifs }) {
  const box = (bg, border) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: bg, border: "1px solid " + border, borderRadius: 12, padding: "12px 14px", marginBottom: 14 });
  if (notifPerm === "unsupported")
    return <div style={{ ...box(c.card, c.line), fontSize: 12, color: c.sub }}>This browser doesn't support notifications.</div>;
  if (notifPerm === "granted")
    return (
      <div style={box(c.card, c.line)}>
        <span style={{ fontSize: 12.5, color: c.green, fontWeight: 600 }}>🔔 Notifications enabled</span>
        <button
          onClick={enableNotifs}
          style={{ flexShrink: 0, cursor: "pointer", border: "1px solid " + c.line, borderRadius: 9, background: "transparent", color: c.text, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "7px 12px" }}
        >
          Send test
        </button>
      </div>
    );
  if (notifPerm === "denied")
    return (
      <div style={{ ...box(c.card, c.line), fontSize: 12, color: c.sub, lineHeight: 1.5 }}>
        Notifications are blocked. Turn them on for this site in your browser's site settings, then reload.
      </div>
    );
  // default — not yet asked
  return (
    <div style={box(c.accent + "14", c.accent + "40")}>
      <div style={{ fontSize: 12.5, color: c.text, lineHeight: 1.5 }}>
        <strong>Turn on notifications</strong> to get nudged when a task is due.
      </div>
      <button
        onClick={enableNotifs}
        style={{ flexShrink: 0, cursor: "pointer", border: "none", borderRadius: 9, background: c.accent, color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "9px 13px" }}
      >
        Enable
      </button>
    </div>
  );
}

function SyncSection({ c, syncCode, syncState, lastSyncedAt, connectSync, disconnectSync, pullNow }) {
  const [entry, setEntry] = useState("");
  const [copied, setCopied] = useState(false);
  const input = { width: "100%", border: "1px solid " + c.line, borderRadius: 11, background: c.card, padding: "11px 13px", fontFamily: "inherit", fontSize: 13.5, color: c.text, outline: "none" };
  const btn = (bg, color) => ({ cursor: "pointer", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "10px 14px", background: bg, color });

  const statusLabel = { idle: "", syncing: "Syncing…", ok: "Synced", error: "Sync failed — check connection" }[syncState] || "";
  const when = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }) : "";

  if (syncCode) {
    return (
      <div style={{ background: c.card, border: "1px solid " + c.line, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11.5, color: c.faint, marginBottom: 6 }}>Your sync code</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{ flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: "0.02em", color: c.text }}>{syncCode}</code>
          <button
            onClick={() => { try { navigator.clipboard.writeText(syncCode); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={btn(copied ? c.green : "transparent", copied ? "#fff" : c.text)}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: c.sub, lineHeight: 1.6 }}>
          Enter this same code in TaskMind on your other device to sync. {statusLabel && <strong style={{ color: syncState === "error" ? c.accent : c.green }}>{statusLabel}</strong>}{when && syncState !== "error" ? ` · last ${when}` : ""}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={pullNow} style={btn(c.accent, "#fff")}>Sync now</button>
          <button onClick={disconnectSync} style={{ ...btn("transparent", c.sub), border: "1px solid " + c.line }}>Disconnect</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => connectSync(makeSyncCode())} style={{ ...btn(c.accent, "#fff"), width: "100%", padding: "12px 0" }}>
        Create a sync code
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0", color: c.faint, fontSize: 11.5 }}>
        <span style={{ flex: 1, height: 1, background: c.line }} />
        or join from another device
        <span style={{ flex: 1, height: 1, background: c.line }} />
      </div>
      <input
        value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Enter an existing code…"
        onKeyDown={(e) => { if (e.key === "Enter") connectSync(entry); }} style={input}
      />
      <div style={{ fontSize: 11, color: c.faint, marginTop: 6 }}>Joining replaces this device's tasks with the synced ones.</div>
      <button onClick={() => connectSync(entry)} disabled={!entry.trim()} style={{ ...btn(entry.trim() ? c.accent : c.seg, entry.trim() ? "#fff" : c.faint), width: "100%", marginTop: 10, padding: "11px 0", cursor: entry.trim() ? "pointer" : "default" }}>
        {syncState === "syncing" ? "Connecting…" : "Join sync"}
      </button>
      {syncState === "error" && <div style={{ fontSize: 12, color: c.accent, marginTop: 8 }}>Couldn't connect. Make sure sync is set up and try again.</div>}
    </div>
  );
}

function Section({ c, title, sub, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: sub ? 4 : 12 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: c.sub, marginBottom: 14, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      {children}
    </div>
  );
}
function Toggle({ c, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", transition: "all .2s", background: on ? c.accent : c.seg }}
      aria-pressed={on}
    >
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
    </button>
  );
}
