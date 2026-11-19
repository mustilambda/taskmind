import { dayKey } from "./eveningPlan";
import { useEffect, useRef, useState } from "react";
import { makeSyncCode, PROMPT, NOTIF_DEFS, catColor, formatDue, toLocalInput, shorten } from "./helpers";
import { Dots, Close } from "./icons";
import PushNotifications from "./PushNotifications";

/* ----------------------------- modals ---------------------------- */
export function Overlay({ c, children, onClose }) {
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

export function TaskEditor({ c, task, categories, onSave, onClose }) {
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

export function CategoryRename({ c, name, onSave, onClose }) {
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

export function Lbl({ c, children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 600, color: c.text, opacity: 0.8, margin: "16px 0 6px" }}>{children}</div>;
}

/* ----------------------- small components ------------------------ */
export function IconBtn({ c, onClick, children, active }) {
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

export function Home({ c, head1, head2, subline, draft, setDraft, addTask, filter, setFilter, filterKeys, visible, newId, toggle, remove, isFresh, dueTodayCount, nextOverdue, focus, setFocus, week, rescheduleOverdue, onEditTask, onRenameCat, snoozeTask, doneCount, totalCount, overdueCount, openCount, highCount, planner }) {
  const [showDone, setShowDone] = useState(false);
  const pending = visible.filter((t) => !t.done);
  const completed = visible.filter((t) => t.done);
  const displayed = showDone ? [...pending, ...completed] : pending;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const suggestions = ["Today", "High priority", "Tomorrow 9am"];
  return (
    <div className="tm-home">
      <section className="tm-hero" style={{ background: `linear-gradient(145deg, ${c.card}, ${c.bg})`, borderColor: c.line }}>
        <div className="tm-hero-copy">
          <div className="tm-eyebrow" style={{ color: c.sub }}>{subline}</div>
          <div className="serif tm-headline">{head1}</div>
          {head2 && <div className="serif tm-headline tm-headline-muted" style={{ color: c.sub }}>{head2}{nextOverdue && <span className="tm-overdue-tag" style={{ background: c.overdue }}>overdue</span>}</div>}
        </div>
        {!isFresh && totalCount > 0 && <div className="tm-progress-orb" style={{ background: `conic-gradient(${c.accent} ${progress}%, ${c.line} 0)` }} aria-label={`${progress}% of today's tasks complete`}>
          <div style={{ background: c.bg }}><strong>{doneCount}/{totalCount}</strong><span>today</span></div>
        </div>}
        {!isFresh && <div className="tm-stats">
          <button onClick={() => setFocus(null)} aria-pressed={!focus}><strong>{openCount}</strong><span>open</span></button>
          <button onClick={() => setFocus(focus?.type === "overdue" ? null : { type: "overdue" })} aria-pressed={focus?.type === "overdue"} disabled={!overdueCount}><strong style={{ color: overdueCount ? c.overdue : c.text }}>{overdueCount}</strong><span>overdue</span></button>
          {dueTodayCount > 0 && <button onClick={() => setFocus(focus?.type === "today" ? null : { type: "today" })} aria-pressed={focus?.type === "today"}><strong>{dueTodayCount}</strong><span>due today</span></button>}
          {highCount > 0 && <button onClick={() => setFocus(focus?.type === "high" ? null : { type: "high" })} aria-pressed={focus?.type === "high"}><strong style={{ color: c.pris.High }}>{highCount}</strong><span>high priority</span></button>}
          {overdueCount > 0 && <button className="tm-stat-action" onClick={rescheduleOverdue} style={{ color: c.accent }}>Move overdue to today</button>}
        </div>}
        {!isFresh && week.some((d) => d.count > 0) && (
          <div className="tm-week" aria-label="Open tasks by day this week">
            {week.map((d) => {
              const max = Math.max(...week.map((x) => x.count), 1);
              const on = focus?.type === "day" && focus.key === d.key;
              return (
                <button key={d.key} disabled={!d.count} aria-pressed={on} onClick={() => setFocus(on ? null : { type: "day", key: d.key })} title={d.count + " open"}>
                  <span className="tm-week-bar"><i style={{ height: Math.max(d.count ? 12 : 3, (d.count / max) * 100) + "%", background: d.count ? (on ? c.accent : c.sub) : c.line, opacity: d.count ? 1 : 0.6 }} /></span>
                  <span style={{ color: d.isToday ? c.accent : c.faint, fontWeight: d.isToday ? 700 : 500 }}>{d.isToday ? "Today" : d.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {planner}

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

      {focus && (
        <div className="tm-focus-chip" style={{ color: c.sub, borderColor: c.line }}>
          Showing {focus.type === "day" ? "tasks for " + new Date(focus.key).toLocaleDateString("en-US", { weekday: "long" }) : focus.type === "high" ? "high priority tasks" : focus.type + " tasks"}
          <button onClick={() => setFocus(null)} style={{ color: c.accent }}>Clear</button>
        </div>
      )}

      {filterKeys.length > 0 && !focus && (
        <div className="tmx tm-tabs" style={{ borderColor: c.line }}>
          {filterKeys.map((k) => (
            <Tab key={k} c={c} k={k} active={filter === k} onSelect={() => setFilter(k)} onRename={() => onRenameCat(k)} />
          ))}
        </div>
      )}

      <div className="tm-task-list">
        {displayed.length === 0 ? (
          <div className="tm-empty" style={{ background: c.card, borderColor: c.line }}>
            <div className="tm-empty-icon" style={{ color: c.accent, background: `${c.accent}14` }}>✦</div>
            <div className="serif">{isFresh ? "A clear mind starts here." : "Everything is clear here."}</div>
            <p style={{ color: c.sub }}>{isFresh ? "Add your first task above. Include a date or priority and I’ll handle the rest." : "No tasks match this view. Enjoy the breathing room."}</p>
            {isFresh && <button onClick={() => setDraft("Plan my week tomorrow at 9am")} style={{ color: c.accent, borderColor: c.line }}>Use an example</button>}
          </div>
        ) : (
          displayed.map((t, i) => (
            <TaskRow key={t.id} t={t} last={i === displayed.length - 1} c={c} newId={newId} toggle={toggle} remove={remove} onEdit={() => onEditTask(t.id)} snoozeTask={snoozeTask} />
          ))
        )}
      </div>
      {completed.length > 0 && <button className="tm-completed-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} style={{ color: c.sub, borderColor: c.line }}>{showDone ? "Hide" : "Show"} completed · {completed.length}</button>}
    </div>
  );
}

// Reusable ⋯ dropdown. `align` controls which side it opens toward.
export function Menu({ c, items, align = "right", trigger, btnStyle }) {
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

export function Tab({ c, k, active, onSelect, onRename }) {
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

export const REPEAT_LABEL = { daily: "↻ Daily", weekly: "↻ Weekly", monthly: "↻ Monthly" };

export function TaskRow({ t, last, c, newId, toggle, remove, onEdit, snoozeTask }) {
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
              {t.planDate === dayKey() && <span className="tm-pill" style={{ color: c.accent, background: `${c.accent}12` }}>Tonight</span>}
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
export function Settings(props) {
  const {
    c, dark, setDark, ctxMode, setCtxMode, savedContext, clearContext, aiAbout, setAiAbout, generating,
    generateProfile, manual, setManual, saveManual, promptCopied, copyPrompt, pasteText, setPasteText, savePasted,
    notify, toggleNotify, notifPerm, enableNotifs, syncCode, syncState, lastSyncedAt, connectSync, disconnectSync, pullNow,
    corrections, resetLearning, onBackgroundChange,
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
        <PushNotifications c={c} code={syncCode} onChange={onBackgroundChange} />
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

export function PermBanner({ c, notifPerm, enableNotifs }) {
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

export function SyncSection({ c, syncCode, syncState, lastSyncedAt, connectSync, disconnectSync, pullNow }) {
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
      <div style={{ fontSize: 11, color: c.faint, marginTop: 6 }}>Joining loads your synced tasks and keeps newly imported tasks that have not synced yet.</div>
      <button onClick={() => connectSync(entry)} disabled={!entry.trim()} style={{ ...btn(entry.trim() ? c.accent : c.seg, entry.trim() ? "#fff" : c.faint), width: "100%", marginTop: 10, padding: "11px 0", cursor: entry.trim() ? "pointer" : "default" }}>
        {syncState === "syncing" ? "Connecting…" : "Join sync"}
      </button>
      {syncState === "error" && <div style={{ fontSize: 12, color: c.accent, marginTop: 8 }}>Couldn't connect. Make sure sync is set up and try again.</div>}
    </div>
  );
}

export function Section({ c, title, sub, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: sub ? 4 : 12 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: c.sub, marginBottom: 14, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      {children}
    </div>
  );
}
export function Toggle({ c, on, onClick }) {
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
