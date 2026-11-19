import { useEffect, useState } from "react";
import { dayKey, estimate, eveningPlan } from "./eveningPlan";

const durationLabel = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
const clock = (m) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function EveningPlanner({ c, tasks, onAdd, onUpdate, onToggle, request }) {
  const [view, setView] = useState("tonight");
  useEffect(() => { if (request && request.view) setView(request.view); }, [request]);
  const [idea, setIdea] = useState("");
  const [stage, setStage] = useState("inbox");
  const [selected, setSelected] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [notice, setNotice] = useState("");
  const [editHours, setEditHours] = useState(false);
  const [window, setWindow] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("taskmind.eveningWindow"));
      if (saved && eveningPlan([], "", saved.start, saved.end).valid) return saved;
    } catch {}
    return { start: "20:00", end: "23:00" };
  });
  const today = dayKey();
  const plan = eveningPlan(tasks, today, window.start, window.end);
  const ideas = tasks.filter((t) => t.ideaStage && !t.done);
  const candidates = tasks.filter((t) => !t.done && !t.pending && !t.ideaStage && t.planDate !== today);
  const field = { background: c.bg, color: c.text, borderColor: c.line };
  const button = { background: c.bg, color: c.text, borderColor: c.line };
  const accent = { background: c.accent, color: "#fff", borderColor: c.accent };
  function changeWindow(key, value) {
    const next = { ...window, [key]: value };
    setWindow(next);
    try { localStorage.setItem("taskmind.eveningWindow", JSON.stringify(next)); } catch {}
  }
  function schedule(task, duration = estimate(task)) {
    if (!plan.valid || duration > plan.free) {
      setNotice("That won't fit yet. Shorten a task or free up some space first.");
      return;
    }
    onUpdate(task.id, { ideaStage: "", planDate: today, planOrder: Date.now(), estimateMinutes: duration });
    setNotice("Added to tonight.");
    setSelected("");
  }
  function addTonight(event) {
    event.preventDefault();
    const title = selected.trim();
    if (!title || !plan.valid || minutes > plan.free) return;
    const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = tasks.find((task) => !task.done && !task.pending && normalize(task.title) === normalize(title));
    if (existing?.planDate === today && !existing.ideaStage) {
      setNotice("Already in tonight's plan.");
      return;
    }
    if (existing) {
      schedule(existing, Number(minutes));
    } else {
      onAdd({ id: crypto.randomUUID(), title, done: false, pending: false, category: "General", priority: "Medium", due: "", dateLabel: "No date", planDate: today, planOrder: Date.now(), estimateMinutes: Number(minutes) });
      setSelected("");
      setNotice("Added to tonight and your task list.");
    }
  }
  return (
    <section className="tm-planner" style={{ background: c.card, borderColor: c.line }} aria-label="Evening planner">
      <div className="tm-plan-tabs" style={{ borderColor: c.line }}>
        <button aria-pressed={view === "tonight"} onClick={() => { setView("tonight"); setNotice(""); }} style={{ color: view === "tonight" ? c.accent : c.sub }}>Tonight's plan <span>{plan.slots.length}</span></button>
        <button aria-pressed={view === "ideas"} onClick={() => { setView("ideas"); setNotice(""); }} style={{ color: view === "ideas" ? c.accent : c.sub }}>Idea inbox <span>{ideas.length}</span></button>
      </div>
      {view === "tonight" ? <>
        <div className="tm-plan-summary" style={{ color: c.sub }}>
          <span>{clock(Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3)))} – {clock(Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3)))}</span>
          <span role="status" style={{ color: plan.over || !plan.valid ? c.accent : c.sub }}>{!plan.valid ? "Check your hours" : plan.over ? `${durationLabel(plan.over)} over` : `${durationLabel(plan.free)} free`}</span>
          <button aria-expanded={editHours} onClick={() => setEditHours(!editHours)} style={{ color: c.sub }}>{editHours ? "Done" : "Edit hours"}</button>
        </div>
        {editHours && <div className="tm-plan-window">
          <label>From <input aria-label="Evening starts" type="time" value={window.start} onChange={(e) => changeWindow("start", e.target.value)} style={field} /></label>
          <label>Until <input aria-label="Evening ends" type="time" value={window.end} onChange={(e) => changeWindow("end", e.target.value)} style={field} /></label>
        </div>}
        <div className="tm-plan-slots">
          {plan.slots.length === 0 && <p className="tm-plan-empty" style={{ color: c.sub }}>No tasks planned yet.</p>}
          {plan.slots.map(({ task }) => <div className="tm-plan-slot" key={task.id} style={{ borderColor: c.line }}>
            <button className="tm-plan-check" aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => onToggle(task.id)} style={{ ...button, background: task.done ? c.green : c.bg, color: task.done ? "#fff" : c.sub }}>{task.done ? "✓" : ""}</button>
            <div className="tm-slot-copy" style={{ textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.6 : 1 }}>{task.title}</div>
            <select aria-label={`Minutes for ${task.title}`} value={estimate(task)} onChange={(e) => onUpdate(task.id, { estimateMinutes: Number(e.target.value) })} style={field}>{[...new Set([15, 30, 45, 60, 90, 120, estimate(task)])].sort((a,b) => a-b).map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}</select>
            <button aria-label={`Remove ${task.title} from tonight`} title="Keep task, remove from tonight" onClick={() => onUpdate(task.id, { planDate: "" })} style={button}>×</button>
          </div>)}
        </div>
        <form className="tm-plan-add" onSubmit={addTonight}>
          <input aria-label="Add a task for tonight" list="tm-tonight-tasks" maxLength={400} placeholder="What do you want to do tonight?" value={selected} onChange={(e) => { setSelected(e.target.value); const t = candidates.find((t) => t.title === e.target.value); if (t) setMinutes(estimate(t)); }} style={field} />
          <datalist id="tm-tonight-tasks">{candidates.map((t) => <option key={t.id} value={t.title} />)}</datalist>
          <select aria-label="Estimated time" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={field}>{[...new Set([15, 30, 45, 60, 90, 120, minutes])].sort((a,b) => a-b).map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}</select>
          <button disabled={!selected.trim() || !plan.valid || minutes > plan.free} style={accent}>Add</button>
        </form>
      </> : <>
        <form className="tm-idea-capture" onSubmit={(e) => { e.preventDefault(); if (!idea.trim()) return; onAdd({ id: crypto.randomUUID(), title: idea.trim(), done: false, ideaStage: "inbox", category: "Ideas", priority: "Low", dateLabel: "No date", estimateMinutes: 30 }); setIdea(""); setStage("inbox"); setNotice("Idea saved without a deadline."); }}>
          <input aria-label="New idea" maxLength={1000} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Save an idea for later…" style={field} />
          <button disabled={!idea.trim()} style={accent}>Save idea</button>
        </form>
        <div className="tm-idea-filters">{[["inbox", "Undecided"], ["week", "This week"], ["later", "Later"]].map(([value, label]) => <button key={value} aria-pressed={stage === value} onClick={() => setStage(value)} style={stage === value ? accent : button}>{label} · {ideas.filter((t) => t.ideaStage === value).length}</button>)}</div>
        {ideas.filter((t) => t.ideaStage === stage).length === 0 && <p className="tm-plan-empty" style={{ color: c.sub }}>No ideas here yet.</p>}
        {ideas.filter((t) => t.ideaStage === stage).map((task) => <div className="tm-idea-row" style={{ borderColor: c.line }} key={task.id}>
          <div>{task.title}</div>
          <div className="tm-idea-actions">
            <select aria-label={`Estimated minutes for ${task.title}`} value={estimate(task)} onChange={(e) => onUpdate(task.id, { estimateMinutes: Number(e.target.value) })} style={field}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}</select>
            <button onClick={() => schedule(task)} style={button}>Tonight</button>
            {task.ideaStage !== "inbox" && <button onClick={() => onUpdate(task.id, { ideaStage: "inbox" })} style={button}>Undecided</button>}
            {task.ideaStage !== "week" && <button onClick={() => onUpdate(task.id, { ideaStage: "week" })} style={button}>This week</button>}
            {task.ideaStage !== "later" && <button onClick={() => onUpdate(task.id, { ideaStage: "later" })} style={button}>Later</button>}
            <button onClick={() => { onUpdate(task.id, { ideaStage: "", category: "Personal", priority: "Medium" }); setNotice("Moved to your task list without a deadline."); }} style={button}>Make task</button>
          </div>
        </div>)}
      </>}
      {notice && <p role="status" className="tm-plan-footnote" style={{ color: c.accent }}>{notice}</p>}
    </section>
  );
}
