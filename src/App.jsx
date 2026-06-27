import { useEffect, useMemo, useRef, useState } from "react";

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
};

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

/* ----------------- press-and-hold (long press) ------------------- */
function useHold({ onClick, onHold, ms = 500 }) {
  const timer = useRef();
  const held = useRef(false);
  const clear = () => clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      held.current = false;
      timer.current = setTimeout(() => {
        held.current = true;
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
        onHold && onHold();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (e) => {
      if (held.current) {
        e.preventDefault();
        e.stopPropagation();
        held.current = false;
        return;
      }
      onClick && onClick();
    },
  };
}

/* --------------------------- notifications ----------------------- */
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
      if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (e) {}
    return DEFAULT_STATE;
  });

  const [page, setPage] = useState("home");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [ctxMode, setCtxMode] = useState("ai");
  const [aiAbout, setAiAbout] = useState("");
  const [generating, setGenerating] = useState(false);
  const [manual, setManual] = useState({ name: "", role: "", focus: "" });
  const [newId, setNewId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [renamingCat, setRenamingCat] = useState(null);

  const { dark, tasks, savedContext, notify } = state;
  const c = useMemo(() => palette(dark), [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);
  useEffect(() => {
    document.body.style.background = c.outer;
  }, [c]);

  // Schedule a browser notification at each task's due time (while the app
  // is open). Re-runs whenever tasks or notification settings change.
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!notify.overdue && !notify.priority && !notify.daily) return;
    const now = Date.now();
    const MAX = 1000 * 60 * 60 * 24 * 20; // setTimeout safe range (~20 days)
    const timers = tasks
      .filter((t) => !t.done && t.due)
      .map((t) => {
        const delay = new Date(t.due).getTime() - now;
        if (delay <= 0 || delay > MAX) return null;
        return setTimeout(() => {
          try {
            new Notification("TaskMind", { body: `Due now: ${t.title}`, tag: "tm-" + t.id });
          } catch (e) {}
        }, delay);
      })
      .filter(Boolean);
    return () => timers.forEach(clearTimeout);
  }, [tasks, notify]);

  /* ------------------------- mutations ------------------------- */
  const addTask = async () => {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setNewId(id);
    setState((s) => ({ ...s, tasks: [{ id, title: text, done: false, pending: true }, ...s.tasks] }));
    setDraft("");

    const existing = [...new Set(tasks.map((t) => t.category).filter(Boolean))];
    let result;
    try {
      result = await callAI({ action: "classify", text, context: savedContext?.text || "", existingCategories: existing });
    } catch (e) {
      result = classifyLocal(text);
    }
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...result, pending: false } : t)) }));
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
    setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...next } : x)) }));
    if (next.due) ensureNotifyPermission();
  };
  // Rename a category/tab everywhere it appears.
  const renameCategory = (from, to) => {
    const name = (to || "").trim();
    if (!name || name === from) return;
    setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.category === from ? { ...x, category: name } : x)) }));
    setFilter((f) => (f === from ? name : f));
  };
  const toggle = (id) => setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }));
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
  const saveManual = () => {
    const { name, role, focus } = manual;
    if (!role.trim() && !focus.trim() && !name.trim()) return;
    const parts = [];
    if (name.trim()) parts.push(name.trim());
    if (role.trim()) parts.push(role.trim());
    let text = parts.join(" — ");
    if (focus.trim()) text += (text ? ". " : "") + "Currently focused on " + focus.trim().replace(/\.$/, "") + ".";
    setState((s) => ({ ...s, savedContext: { text, source: "Written manually", cats: detectCatsLocal(role + " " + focus) } }));
  };

  /* ------------------------- derived --------------------------- */
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.overdue);
  const high = open.filter((t) => t.priority === "High");
  const doneCount = tasks.filter((t) => t.done).length;
  const isFresh = tasks.length === 0;

  let head1, head2;
  if (isFresh) {
    head1 = "What's on your mind?";
    head2 = "Add a task — I'll sort it for you.";
  } else if (open.length === 0) {
    head1 = "You're all caught up.";
    head2 = "Enjoy the quiet.";
  } else if (overdue.length > 0) {
    head1 = numWord(overdue.length) + (overdue.length > 1 ? " things are overdue." : " thing is overdue.");
    head2 = "Start with " + shorten(overdue[0].title) + ".";
  } else if (high.length > 0) {
    head1 = numWord(high.length) + (high.length > 1 ? " high-priority tasks today." : " high-priority task today.");
    head2 = "The rest can wait.";
  } else {
    head1 = numWord(open.length) + (open.length > 1 ? " tasks on your plate." : " task on your plate.");
    head2 = "Nothing urgent — pick one.";
  }

  const subline = isFresh
    ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " · " + doneCount + " of " + tasks.length + " done";

  // dynamic tabs: only categories that actually exist among the tasks
  const cats = [...new Set(tasks.map((t) => t.category).filter(Boolean))];
  const filterKeys = cats.length ? ["all", ...cats] : [];
  const visible = filter === "all" || !filterKeys.includes(filter) ? tasks : tasks.filter((t) => t.category === filter);

  return (
    <div style={{ minHeight: "100vh", background: c.outer, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div
        className="tmx"
        style={{
          width: "100%", maxWidth: 430, height: 820, maxHeight: "94vh", background: c.bg, borderRadius: 30,
          border: "1px solid " + c.frame, overflowY: "auto", color: c.text, position: "relative",
          boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
        }}
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
            onEditTask={setEditingId} onRenameCat={setRenamingCat}
          />
        ) : (
          <Settings
            c={c} dark={dark} setDark={setDark} ctxMode={ctxMode} setCtxMode={setCtxMode} savedContext={savedContext}
            clearContext={clearContext} aiAbout={aiAbout} setAiAbout={setAiAbout} generating={generating}
            generateProfile={generateProfile} manual={manual} setManual={setManual} saveManual={saveManual}
            notify={notify} toggleNotify={toggleNotify}
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
      style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.45)", borderRadius: 30, display: "flex", alignItems: "flex-end" }}
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

  const input = { width: "100%", border: "1px solid " + c.line, borderRadius: 11, background: c.card, padding: "11px 13px", fontFamily: "inherit", fontSize: 13.5, color: c.text, outline: "none" };
  const seg = { flex: 1, cursor: "pointer", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "9px 0", transition: "all .15s" };

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      category: category.trim(),
      priority,
      reason: reason.trim(),
      due: due ? new Date(due).toISOString() : "",
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

function Home({ c, head1, head2, subline, draft, setDraft, addTask, filter, setFilter, filterKeys, visible, newId, toggle, remove, isFresh, onEditTask, onRenameCat }) {
  return (
    <div style={{ padding: "6px 24px 0" }}>
      <div style={{ paddingTop: 14 }}>
        <div className="serif" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.015em" }}>{head1}</div>
        <div className="serif" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.015em", color: c.sub, fontStyle: "italic" }}>{head2}</div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: c.faint }}>{subline}</div>
      </div>

      <div style={{ marginTop: 22, background: c.card, border: "1px solid " + c.line, borderRadius: 16, padding: 14, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          rows={1} value={draft} placeholder="Add a task — TaskMind will sort it…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addTask(); } }}
          style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.4, color: c.text, maxHeight: 90 }}
        />
        <button
          onClick={addTask}
          style={{ flexShrink: 0, cursor: draft.trim() ? "pointer" : "default", border: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: draft.trim() ? c.accent : c.faint, padding: "2px 2px" }}
        >
          Organize →
        </button>
      </div>

      {filterKeys.length > 0 && (
        <div className="tmx" style={{ marginTop: 22, display: "flex", gap: 18, overflowX: "auto", borderBottom: "1px solid " + c.line }}>
          {filterKeys.map((k) => (
            <Tab key={k} c={c} k={k} active={filter === k} onSelect={() => setFilter(k)} onRename={() => onRenameCat(k)} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 4 }}>
        {visible.length === 0 ? (
          <div style={{ padding: "44px 8px", textAlign: "center", color: c.faint, fontSize: 13.5, lineHeight: 1.6 }}>
            {isFresh
              ? "No tasks yet. Type anything above — “email the team”, “fix the signup bug”, “book a dentist” — and TaskMind files it into the right place automatically."
              : "Nothing here."}
          </div>
        ) : (
          visible.map((t, i) => (
            <TaskRow key={t.id} t={t} last={i === visible.length - 1} c={c} newId={newId} toggle={toggle} remove={remove} onEdit={() => onEditTask(t.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function Tab({ c, k, active, onSelect, onRename }) {
  const hold = useHold({ onClick: onSelect, onHold: k === "all" ? undefined : onRename });
  return (
    <button
      {...hold}
      title={k === "all" ? "" : "Press and hold to rename"}
      style={{
        flexShrink: 0, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit",
        fontSize: 12.5, padding: "0 0 9px", whiteSpace: "nowrap", transition: "all .15s", touchAction: "manipulation",
        color: active ? c.text : c.sub, fontWeight: active ? 600 : 450,
        borderBottom: "1.5px solid " + (active ? c.accent : "transparent"),
      }}
    >
      {k === "all" ? "All" : k}
    </button>
  );
}

function TaskRow({ t, last, c, newId, toggle, remove, onEdit }) {
  const cColor = t.category ? catColor(t.category, c) : c.sub;
  const priColor = c.pris[t.priority] || c.sub;
  const hold = useHold({ onHold: t.pending ? undefined : onEdit });
  const stop = { onPointerDown: (e) => e.stopPropagation() };
  return (
    <div
      {...hold}
      title="Press and hold to edit"
      style={{
        padding: "17px 0", display: "flex", gap: 13, alignItems: "flex-start", touchAction: "manipulation",
        animation: t.id === newId ? "tmIn .25s ease both" : undefined, cursor: t.pending ? "default" : "pointer",
        borderBottom: last ? "none" : "1px solid " + c.line, opacity: t.done ? 0.5 : 1,
      }}
    >
      <div
        {...stop}
        onClick={(e) => { e.stopPropagation(); !t.pending && toggle(t.id); }}
        style={{
          flexShrink: 0, width: 19, height: 19, marginTop: 2, borderRadius: "50%", cursor: t.pending ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
          background: t.done ? c.green : "transparent", border: "1.5px solid " + (t.done ? c.green : c.checkBorder),
        }}
      >
        {t.done && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 450, lineHeight: 1.35, letterSpacing: "-0.005em", color: t.done ? c.faint : c.text, textDecoration: t.done ? "line-through" : "none" }}>
          {t.title}
        </div>
        {t.pending ? (
          <div style={{ marginTop: 7, fontSize: 11.5, color: c.faint, fontStyle: "italic" }}>TaskMind is sorting this…</div>
        ) : (
          <>
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {t.category && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: cColor }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cColor }} />
                  {t.category}
                </span>
              )}
              {t.priority && <span style={{ fontSize: 11.5, color: priColor }}>{t.priority}</span>}
              {t.dateLabel && <span style={{ fontSize: 11.5, color: t.overdue ? c.overdue : c.sub }}>{t.dateLabel}</span>}
            </div>
            {!t.done && t.reason && <div style={{ marginTop: 6, fontSize: 11.5, color: c.faint, lineHeight: 1.4 }}>{t.reason}</div>}
          </>
        )}
      </div>
      <button
        {...stop}
        onClick={(e) => { e.stopPropagation(); remove(t.id); }}
        style={{ flexShrink: 0, cursor: "pointer", background: "none", border: "none", color: c.delete, fontSize: 18, lineHeight: 1, padding: "0 2px" }}
        aria-label="Delete task"
      >
        ×
      </button>
    </div>
  );
}

/* ----------------------------- settings -------------------------- */
function Settings(props) {
  const {
    c, dark, setDark, ctxMode, setCtxMode, savedContext, clearContext, aiAbout, setAiAbout, generating,
    generateProfile, manual, setManual, saveManual, notify, toggleNotify,
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

      <Section c={c} title="Appearance">
        <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 11, padding: 4 }}>
          <button onClick={() => setDark(false)} style={{ ...segBase, ...(!dark ? segOn : segOff) }}>☀ Light</button>
          <button onClick={() => setDark(true)} style={{ ...segBase, ...(dark ? segOn : segOff) }}>☾ Dark</button>
        </div>
      </Section>

      <Section c={c} title="Notifications">
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
