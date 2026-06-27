import { useEffect, useMemo, useRef, useState } from "react";

/* ---------------------------------------------------------------- *
 * TaskMind — AI personal task organizer
 * Faithful React port of the original bundled artifact, with
 * localStorage persistence so tasks & settings survive a refresh.
 * ---------------------------------------------------------------- */

const STORAGE_KEY = "taskmind.v1";

const DEFAULT_TASKS = [
  { id: 2, title: "Fix login bug on staging build", category: "App Dev", priority: "High", dateLabel: "Overdue · Jun 24", overdue: true, done: false, reason: "Blocks the release — flagged as a hard blocker." },
  { id: 1, title: "Write Q3 content calendar for the newsletter", category: "Content", priority: "High", dateLabel: "Today", overdue: false, done: false, reason: "Recurring deadline — you publish every Monday." },
  { id: 5, title: "Submit Q2 expense report to finance", category: "Admin", priority: "Medium", dateLabel: "Overdue · Jun 25", overdue: true, done: false, reason: "Past due — finance closes the books this week." },
  { id: 3, title: "Finalize the new logo color variants", category: "Brand", priority: "Medium", dateLabel: "Jun 28", overdue: false, done: false, reason: "Design review is scheduled for Thursday." },
  { id: 7, title: "Record the onboarding tutorial video", category: "Content", priority: "Medium", dateLabel: "Jun 30", overdue: false, done: false, reason: "Tied to the product launch on the 30th." },
  { id: 6, title: "Book a dentist appointment", category: "Personal", priority: "Low", dateLabel: "This weekend", overdue: false, done: false, reason: "Flexible timing — slotted into your downtime." },
  { id: 4, title: "Read the competitor pricing research doc", category: "Research", priority: "Low", dateLabel: "No date", overdue: false, done: true, reason: "No deadline — good to skim between meetings." },
];

const DEFAULT_STATE = {
  dark: false,
  tasks: DEFAULT_TASKS,
  savedContext: null,
  notify: { daily: true, overdue: true, priority: false },
};

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

const FILTER_KEYS = ["all", "Content", "App Dev", "Brand", "Research", "Admin", "Personal"];

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
      cats: { Content: "#B49BF5", "App Dev": "#5FC97E", Brand: "#EC9460", Research: "#6DA8EE", Admin: "#ABA290", Personal: "#E0B24A" },
      pris: { High: "#E45D4E", Medium: "#E0B24A", Low: "#5FC97E" },
      overdue: "#E45D4E",
    };
  return {
    outer: "#E7DDCA", bg: "#F2EBDC", frame: "#E0D5C0", text: "#211C16", sub: "#6E675B",
    faint: "#948B79", line: "#E2D7C2", accent: "#BE3A2E", green: "#6FA873",
    checkBorder: "#CABFA9", delete: "#BBB09A", card: "#EDE5D3", seg: "#E6DCC8", segActive: "#FFFDF8",
    cats: { Content: "#7C5BD0", "App Dev": "#3F9D5C", Brand: "#CF6A33", Research: "#3B7DD8", Admin: "#7A7468", Personal: "#B5841A" },
    pris: { High: "#BE3A2E", Medium: "#A8780F", Low: "#3F9D5C" },
    overdue: "#BE3A2E",
  };
}

/* --------------------------- AI helpers -------------------------- */
function classify(text) {
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
    "Matched your work context — set as " + priority + " priority" +
    (dateLabel === "This weekend" ? ", flexible timing." : ", suggested for " + dateLabel.toLowerCase() + ".");
  return { category, priority, dateLabel, reason, overdue: false };
}

function detectCats(text) {
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

  // UI-only state (not persisted)
  const [page, setPage] = useState("home");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [ctxMode, setCtxMode] = useState("ai");
  const [promptCopied, setPromptCopied] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [manual, setManual] = useState({ name: "", role: "", focus: "" });
  const [newId, setNewId] = useState(null);

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

  /* ------------------------- mutations ------------------------- */
  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setNewId(id);
    setState((s) => ({ ...s, tasks: [{ id, title: text, done: false, ...classify(text) }, ...s.tasks] }));
    setDraft("");
  };
  const toggle = (id) =>
    setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }));
  const remove = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id) }));
  const setDark = (v) => setState((s) => ({ ...s, dark: v }));
  const toggleNotify = (key) => setState((s) => ({ ...s, notify: { ...s.notify, [key]: !s.notify[key] } }));

  const saveAI = () => {
    const text = pasteText.trim();
    if (!text) return;
    setState((s) => ({ ...s, savedContext: { text, source: "AI summary", cats: detectCats(text) } }));
  };
  const saveManual = () => {
    const { name, role, focus } = manual;
    if (!role.trim() && !focus.trim() && !name.trim()) return;
    const parts = [];
    if (name.trim()) parts.push(name.trim());
    if (role.trim()) parts.push(role.trim());
    let text = parts.join(" — ");
    if (focus.trim()) text += (text ? ". " : "") + "Currently focused on " + focus.trim().replace(/\.$/, "") + ".";
    setState((s) => ({ ...s, savedContext: { text, source: "Written manually", cats: detectCats(role + " " + focus) } }));
  };
  const copyPrompt = () => {
    try {
      navigator.clipboard && navigator.clipboard.writeText(PROMPT);
    } catch (e) {}
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  /* ------------------------- derived --------------------------- */
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.overdue);
  const high = open.filter((t) => t.priority === "High");
  const doneCount = tasks.filter((t) => t.done).length;

  let head1, head2;
  if (open.length === 0) {
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

  const subline =
    new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
    " · " + doneCount + " of " + tasks.length + " done";

  const visible = filter === "all" ? tasks : tasks.filter((t) => t.category === filter);

  /* --------------------------- shell --------------------------- */
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
        {/* top bar */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: c.bg, padding: "22px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="serif" style={{ fontSize: 26, fontStyle: "italic", letterSpacing: "-0.01em" }}>TaskMind</div>
          <div style={{ display: "flex", gap: 8 }}>
            <IconBtn c={c} onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</IconBtn>
            <IconBtn c={c} onClick={() => setPage(page === "home" ? "settings" : "home")} active={page === "settings"}>
              <Gear />
            </IconBtn>
          </div>
        </div>

        {page === "home" ? (
          <Home
            c={c} head1={head1} head2={head2} subline={subline} draft={draft} setDraft={setDraft}
            addTask={addTask} filter={filter} setFilter={setFilter} visible={visible} newId={newId}
            toggle={toggle} remove={remove}
          />
        ) : (
          <Settings
            c={c} dark={dark} setDark={setDark} ctxMode={ctxMode} setCtxMode={setCtxMode}
            savedContext={savedContext} clearContext={() => setState((s) => ({ ...s, savedContext: null }))}
            promptCopied={promptCopied} copyPrompt={copyPrompt} pasteText={pasteText} setPasteText={setPasteText}
            saveAI={saveAI} manual={manual} setManual={setManual} saveManual={saveManual}
            notify={notify} toggleNotify={toggleNotify}
          />
        )}

        <div style={{ textAlign: "center", padding: "26px 0 30px", fontSize: 11.5, color: c.faint }}>
          TaskMind · made for the way you work
        </div>
      </div>
    </div>
  );
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

function Home({ c, head1, head2, subline, draft, setDraft, addTask, filter, setFilter, visible, newId, toggle, remove }) {
  return (
    <div style={{ padding: "6px 24px 0" }}>
      <div style={{ paddingTop: 14 }}>
        <div className="serif" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.015em" }}>{head1}</div>
        <div className="serif" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.015em", color: c.sub, fontStyle: "italic" }}>{head2}</div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: c.faint }}>{subline}</div>
      </div>

      {/* add box */}
      <div style={{ marginTop: 22, background: c.card, border: "1px solid " + c.line, borderRadius: 16, padding: 14, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          rows={1} value={draft} placeholder="Add a task — TaskMind will sort it…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addTask(); } }}
          style={{
            flex: 1, resize: "none", border: "none", outline: "none", background: "transparent",
            fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.4, color: c.text, maxHeight: 90,
          }}
        />
        <button
          onClick={addTask}
          style={{
            flexShrink: 0, cursor: draft.trim() ? "pointer" : "default", border: "none", background: "transparent",
            fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: draft.trim() ? c.accent : c.faint, padding: "2px 2px",
          }}
        >
          Organize →
        </button>
      </div>

      {/* filters */}
      <div className="tmx" style={{ marginTop: 22, display: "flex", gap: 18, overflowX: "auto", borderBottom: "1px solid " + c.line }}>
        {FILTER_KEYS.map((k) => {
          const active = filter === k;
          return (
            <button
              key={k} onClick={() => setFilter(k)}
              style={{
                flexShrink: 0, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit",
                fontSize: 12.5, padding: "0 0 9px", whiteSpace: "nowrap", transition: "all .15s",
                color: active ? c.text : c.sub, fontWeight: active ? 600 : 450,
                borderBottom: "1.5px solid " + (active ? c.accent : "transparent"),
              }}
            >
              {k === "all" ? "All" : k}
            </button>
          );
        })}
      </div>

      {/* tasks */}
      <div style={{ marginTop: 4 }}>
        {visible.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: c.faint, fontSize: 13.5 }}>
            {filter === "all" ? "Nothing here." : "No tasks in this filter."}
          </div>
        ) : (
          visible.map((t, i) => (
            <TaskRow key={t.id} t={t} i={i} last={i === visible.length - 1} c={c} newId={newId} toggle={toggle} remove={remove} />
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({ t, i, last, c, newId, toggle, remove }) {
  const catColor = c.cats[t.category] || c.sub;
  const priColor = c.pris[t.priority] || c.sub;
  return (
    <div
      style={{
        padding: "17px 0", display: "flex", gap: 13, alignItems: "flex-start",
        animation: t.id === newId ? "tmIn .25s ease both" : undefined,
        borderBottom: last ? "none" : "1px solid " + c.line, opacity: t.done ? 0.5 : 1,
      }}
    >
      <div
        onClick={() => toggle(t.id)}
        style={{
          flexShrink: 0, width: 19, height: 19, marginTop: 2, borderRadius: "50%", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
          background: t.done ? c.green : "transparent",
          border: "1.5px solid " + (t.done ? c.green : c.checkBorder),
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
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: catColor }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: catColor }} />
            {t.category}
          </span>
          <span style={{ fontSize: 11.5, color: priColor }}>{t.priority}</span>
          <span style={{ fontSize: 11.5, color: t.overdue ? c.overdue : c.sub }}>{t.dateLabel}</span>
        </div>
        {!t.done && t.reason && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: c.faint, lineHeight: 1.4 }}>{t.reason}</div>
        )}
      </div>
      <button
        onClick={() => remove(t.id)}
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
    c, dark, setDark, ctxMode, setCtxMode, savedContext, clearContext, promptCopied, copyPrompt,
    pasteText, setPasteText, saveAI, manual, setManual, saveManual, notify, toggleNotify,
  } = props;

  const segBase = { flex: 1, cursor: "pointer", border: "none", borderRadius: 9, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, padding: "9px 0", transition: "all .15s" };
  const segOn = { background: c.segActive, color: c.text, boxShadow: "0 1px 3px rgba(0,0,0,0.13)" };
  const segOff = { background: "transparent", color: c.sub };
  const inputStyle = { width: "100%", border: "1px solid " + c.line, borderRadius: 12, background: c.card, padding: "12px 14px", fontFamily: "inherit", fontSize: 13.5, color: c.text, outline: "none" };
  const primaryBtn = (enabled) => ({ marginTop: 12, width: "100%", cursor: enabled ? "pointer" : "default", border: "none", borderRadius: 11, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "11px 18px", transition: "all .15s", background: enabled ? c.accent : c.seg, color: enabled ? "#fff" : c.faint });

  return (
    <div style={{ padding: "10px 24px 0" }}>
      <div className="serif" style={{ fontSize: 28, fontStyle: "italic", paddingTop: 8 }}>Settings</div>

      {/* About you */}
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
                  {savedContext.cats.map((k) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 500, color: c.cats[k] || c.sub, background: c.card, border: "1px solid " + c.line, padding: "5px 11px", borderRadius: 20 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.cats[k] || c.sub }} />
                      {k}
                    </span>
                  ))}
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
                <button onClick={saveAI} disabled={!pasteText.trim()} style={primaryBtn(!!pasteText.trim())}>Save context</button>
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

      {/* Appearance */}
      <Section c={c} title="Appearance">
        <div style={{ display: "flex", gap: 6, background: c.seg, borderRadius: 11, padding: 4 }}>
          <button onClick={() => setDark(false)} style={{ ...segBase, ...(!dark ? segOn : segOff) }}>☀ Light</button>
          <button onClick={() => setDark(true)} style={{ ...segBase, ...(dark ? segOn : segOff) }}>☾ Dark</button>
        </div>
      </Section>

      {/* Notifications */}
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
