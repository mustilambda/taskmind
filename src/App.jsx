import { useEffect, useMemo, useRef, useState } from "react";
import { readTaskImport, uniqueImportedTasks, mergePendingImports } from "./taskImport";
import EveningPlanner from "./EveningPlanner";
import { dayKey } from "./eveningPlan";
import { summarizeTasks, weekOutlook, rescheduleTarget, matchesFocus } from "./dashboard";
import { mergeTasks, mergeDeleted, touch } from "./taskMerge";

/* ---------------------------------------------------------------- *
 * TaskMind — AI personal task organizer
 * - Per-browser data (localStorage); every visitor is isolated.
 * - Dynamic, AI-assigned categories: no fixed tabs. New users start
 *   empty; tabs appear only for categories the AI actually creates.
 * - Real sorting via /api/ai (Groq, server-side key). Falls back to a
 *   local keyword sorter when the API is unreachable (e.g. dev/offline).
 * ---------------------------------------------------------------- */

import { STORAGE_KEY, DEFAULT_STATE, syncableData, normalizeSyncedData, callSync, PROMPT, palette, classifyLocal, detectCatsLocal, callAI, formatDue, parseDirectives, showNotify, ensureNotifyPermission } from "./helpers";
import { Moon, Sun, Close, Gear } from "./icons";
import { Overlay, TaskEditor, CategoryRename, IconBtn, Home, Settings } from "./components";

/* --------------------------- the app ----------------------------- */
export default function App() {
  const [taskImport, setTaskImport] = useState(() => readTaskImport(window.location.hash));
  const [importMessage, setImportMessage] = useState("");
  const closeImport = () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    params.delete("tasks");
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (params.size ? "#" + params.toString() : ""));
    setTaskImport(null);
  };
  useEffect(() => {
    const handleLink = () => { setImportMessage(""); setTaskImport(readTaskImport(window.location.hash)); };
    window.addEventListener("hashchange", handleLink);
    return () => window.removeEventListener("hashchange", handleLink);
  }, []);
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...(saved && typeof saved === "object" ? saved : {}),
          tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
          deleted: saved?.deleted && typeof saved.deleted === "object" ? saved.deleted : {},
          pendingImports: Array.isArray(saved?.pendingImports) ? saved.pendingImports : [],
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
  const [focus, setFocus] = useState(null); // { type: "overdue" | "high" | "today" | "day", key? }
  const [toast, setToast] = useState(null); // { label, snapshot } for Undo
  const toastTimer = useRef();
  const [editingId, setEditingId] = useState(null);
  const [renamingCat, setRenamingCat] = useState(null);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | ok | error
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [backgroundEnabled, setBackgroundEnabled] = useState(() => localStorage.getItem("taskmind.backgroundEnabled") === "true");
  useEffect(() => { localStorage.setItem("taskmind.backgroundEnabled", String(backgroundEnabled)); }, [backgroundEnabled]);
  const [, setTick] = useState(0); // forces a re-render each minute so overdue badges stay current

  const { dark, tasks, savedContext, notify, corrections } = state;
  const c = useMemo(() => palette(dark), [dark]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);
  useEffect(() => {
    document.body.style.background = c.bg;
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
      if (backgroundEnabled) return;
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
  }, [tasks, notify, notifPerm, backgroundEnabled]);

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
    setSyncState("syncing");
    try {
      // Merge anything another device pushed since our last pull, so we never
      // overwrite its edits with an older snapshot of this device.
      let data = syncableData(stateRef.current);
      try {
        const pulled = await callSync({ action: "pull", code });
        if (pulled.blob && pulled.blob.data) {
          const remote = normalizeSyncedData(pulled.blob.data);
          const merged = mergeTasks(data.tasks, remote.tasks, data.deleted, remote.deleted);
          data = { ...data, tasks: merged.tasks, deleted: merged.deleted };
        }
      } catch (e) {}
      const sig = JSON.stringify(data);
      const out = await callSync({ action: "push", code, data });
      lastPushedSig.current = sig;
      const pushedIds = new Set(data.tasks.map((task) => task.id));
      setState((s) => {
        const merged = mergeTasks(s.tasks, data.tasks, s.deleted, data.deleted);
        return { ...s, tasks: merged.tasks, deleted: merged.deleted, pendingImports: s.pendingImports.filter((task) => !pushedIds.has(task.id)), sync: { ...s.sync, lastSyncedAt: out.updatedAt } };
      });
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
          // Merge per task instead of replacing: local edits made since the last sync are kept.
          const merged = mergeTasks(s.tasks, remote.tasks, s.deleted, remote.deleted);
          return { ...s, ...remote, tasks: merged.tasks, deleted: merged.deleted, sync: { ...s.sync, lastSyncedAt: out.blob.updatedAt } };
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
        setState((s) => ({ ...s, ...remote, tasks: mergePendingImports(remote.tasks, s.pendingImports, s.tasks), sync: { code: c, lastSyncedAt: out.blob.updatedAt || Date.now() } }));
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
  }, [state.tasks, state.deleted, state.savedContext, state.notify, state.aiSummary, state.corrections, code]);

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
    setState((s) => ({ ...s, tasks: [{ id, title, done: false, pending: true, updatedAt: Date.now() }, ...s.tasks] }));
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
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...merged, pending: false, updatedAt: Date.now() } : t)) }));
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
      return { ...s, corrections, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...next, updatedAt: Date.now() } : x)) };
    });
    if (next.due) ensureNotifyPermission();
  };
  // Rename a category/tab everywhere it appears.
  const renameCategory = (from, to) => {
    const name = (to || "").trim();
    if (!name || name === from) return;
    setState((s) => ({ ...s, tasks: s.tasks.map((x) => (x.category === from ? { ...x, category: name, updatedAt: Date.now() } : x)) }));
    setFilter((f) => (f === from ? name : f));
  };
  const offerUndo = (label, snapshot) => {
    clearTimeout(toastTimer.current);
    setToast({ label, snapshot });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };
  const undo = () => {
    if (!toast) return;
    const snap = toast.snapshot;
    clearTimeout(toastTimer.current);
    setToast(null);
    setState((s) => {
      const now = Date.now();
      const keep = new Set(snap.map((t) => t.id));
      const deleted = { ...s.deleted };
      s.tasks.forEach((t) => { if (!keep.has(t.id)) deleted[t.id] = now; });
      const tasks = snap.map((t) => (s.tasks.find((x) => x.id === t.id) === t ? t : touch(t, now)));
      return { ...s, tasks, deleted };
    });
  };
  const toggle = (id) => {
    const before = stateRef.current.tasks;
    const target = before.find((x) => x.id === id);
    if (target && !target.done) offerUndo("Marked done", before);
    toggleTask(id);
  };
  const toggleTask = (id) => setState((s) => {
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
      extra = [{ ...task, id: Date.now(), done: false, completedAt: undefined, updatedAt: Date.now(), due, dateLabel: formatDue(due), overdue: false }];
    }

    return { ...s, tasks: [...extra, ...s.tasks.map((x) => (x.id === id ? { ...x, done: nowDone, completedAt: nowDone ? Date.now() : undefined, updatedAt: Date.now() } : x))] };
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
      return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, due, dateLabel: formatDue(due), overdue: false, updatedAt: Date.now() } : t)) };
    });
  };
  // Move every overdue task to this evening (or an hour from now if it's already late).
  const rescheduleOverdue = () => {
    const now = new Date();
    const due = rescheduleTarget(now).toISOString();
    const ids = new Set(summarizeTasks(stateRef.current.tasks, now).overdue.map((t) => t.id));
    if (!ids.size) return;
    offerUndo(ids.size + " task" + (ids.size !== 1 ? "s" : "") + " moved to today", stateRef.current.tasks);
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (ids.has(t.id) ? { ...t, due, dateLabel: formatDue(due), overdue: false, updatedAt: Date.now() } : t)) }));
    setFocus(null);
  };
  const remove = (id) => {
    offerUndo("Task deleted", stateRef.current.tasks);
    setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id), deleted: { ...mergeDeleted(s.deleted), [id]: Date.now() } }));
  };
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
  const now = new Date();
  const sum = summarizeTasks(tasks, now);
  const { active: activeTasks, open, overdue, high, nextTask, nextOverdue } = sum;
  const doneToday = sum.doneToday.length;
  const isFresh = activeTasks.length === 0;
  const week = weekOutlook(tasks, now);

  let head1, head2;
  if (isFresh) {
    head1 = "What's on your mind?";
    head2 = "Add a task — I'll sort it for you.";
  } else if (open.length === 0) {
    head1 = "You're all caught up.";
    head2 = doneToday ? doneToday + " done today — nothing left." : "Nothing left to do.";
  } else {
    head1 = open.length + " open task" + (open.length !== 1 ? "s" : "") + ".";
    head2 = "Next up: " + nextTask.title + ".";
  }

  const subline = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // dynamic tabs: only categories that actually exist among the tasks
  const cats = [...new Set(activeTasks.map((t) => t.category).filter(Boolean))];
  const filterKeys = ["today", "all", ...cats];
  const todayStr = new Date().toDateString();
  const visible = focus
    ? activeTasks.filter((t) => !t.done && matchesFocus(t, focus, now))
    : filter === "today"
      ? activeTasks.filter((t) => !t.done && (t.planDate === dayKey() || (t.due && (new Date(t.due).toDateString() === todayStr || new Date(t.due).getTime() < Date.now()))))
      : filter === "all" || !filterKeys.includes(filter)
      ? activeTasks
      : activeTasks.filter((t) => t.category === filter);

  return (
    <div className="tm-outer" style={{ background: c.bg }}>
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
            toggle={toggle} remove={remove} isFresh={isFresh} dueTodayCount={sum.dueToday.length} nextOverdue={nextOverdue} focus={focus} setFocus={setFocus} week={week} rescheduleOverdue={rescheduleOverdue}
            onEditTask={setEditingId} onRenameCat={setRenamingCat} snoozeTask={snoozeTask}
            openCount={open.length} doneCount={doneToday} totalCount={sum.todayTotal} overdueCount={overdue.length} highCount={high.length}
            planner={<EveningPlanner c={c} tasks={tasks} onAdd={(task) => { setState((s) => ({ ...s, tasks: [...s.tasks, touch(task)] })); if (!task.ideaStage) setFilter("all"); }} onUpdate={updateTask} onToggle={toggle} />}
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
            onBackgroundChange={setBackgroundEnabled}
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
        {taskImport && (
          <Overlay c={c} onClose={closeImport}>
            <div role="dialog" aria-modal="true" aria-labelledby="import-title">
              <h2 id="import-title">Add tasks to TaskMind</h2>
              {taskImport.error ? <p role="alert">{taskImport.error}</p> : <>
                <p>Review these tasks before saving. Existing tasks will be kept. Matching titles and times are skipped.</p>
                {!code && <p>These tasks will be saved on this device and kept when you connect your sync code in Settings.</p>}
                <ul style={{ maxHeight: "45vh", overflowY: "auto", paddingLeft: 22 }}>
                  {taskImport.tasks.map((task, i) => <li key={i} style={{ marginBottom: 14 }}>
                    <strong>{task.title}</strong>
                    <div>{task.due ? new Date(task.due).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "No date"} · {task.priority} · {task.category}</div>
                    {task.reason && <div>{task.reason}</div>}
                  </li>)}
                </ul>
                <p>Times are shown in this device’s time zone.</p>
                <button disabled={syncState === "syncing"} onClick={() => {
                  setState((s) => {
                    const added = uniqueImportedTasks(taskImport.tasks, s.tasks).map((t) => ({ ...t, id: crypto.randomUUID(), updatedAt: Date.now(), dateLabel: t.due ? formatDue(t.due) : "No date" }));
                    return { ...s, tasks: [...added, ...s.tasks], pendingImports: [...s.pendingImports, ...added] };
                  });
                  setImportMessage("Tasks added. Any matching tasks were skipped.");
                  closeImport();
                }}>Add tasks</button>
              </>}
              <button onClick={closeImport} style={{ marginLeft: 12 }}>Cancel</button>
            </div>
          </Overlay>
        )}
        {importMessage && <p role="status" style={{ textAlign: "center" }}>{importMessage}</p>}
        {renamingCat != null && (
          <CategoryRename
            c={c}
            name={renamingCat}
            onSave={(to) => { renameCategory(renamingCat, to); setRenamingCat(null); }}
            onClose={() => setRenamingCat(null)}
          />
        )}
      </div>
      {toast && (
        <div className="tm-toast" role="status" style={{ background: c.text, color: c.bg }}>
          <span>{toast.label}</span>
          <button onClick={undo} style={{ color: c.bg }}>Undo</button>
        </div>
      )}
    </div>
  );
}

