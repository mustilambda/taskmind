// Pure dashboard calculations, kept out of the UI so they can be tested.
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const isOverdue = (t, now) => (t.due ? new Date(t.due).getTime() < now.getTime() : Boolean(t.overdue));

export function summarizeTasks(tasks, now = new Date()) {
  const active = tasks.filter((t) => !t.ideaStage);
  const open = active.filter((t) => !t.done);
  const overdue = open.filter((t) => isOverdue(t, now));
  const high = open.filter((t) => t.priority === "High");
  const dueToday = open.filter((t) => !overdue.includes(t) && t.due && sameDay(new Date(t.due), now));
  // Progress is about *today*: tasks finished today vs. what is still open.
  const doneToday = active.filter((t) => t.done && t.completedAt && sameDay(new Date(t.completedAt), now));
  const nextTask = open.length ? overdue[0] || high[0] || open[0] : null;
  return {
    active, open, overdue, high, dueToday, doneToday, nextTask,
    nextOverdue: Boolean(nextTask && overdue.includes(nextTask)),
    todayTotal: open.length + doneToday.length,
    progress: open.length + doneToday.length ? Math.round((doneToday.length / (open.length + doneToday.length)) * 100) : 0,
  };
}

// Open-task counts for the next `days` days (overdue tasks land on today).
export function weekOutlook(tasks, now = new Date(), days = 7) {
  const open = tasks.filter((t) => !t.ideaStage && !t.done && t.due);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const count = open.filter((t) => {
      const due = new Date(t.due);
      return i === 0 ? due.getTime() < start.getTime() + 86400000 : sameDay(due, day);
    }).length;
    return { key: day.toDateString(), label: day.toLocaleDateString("en-US", { weekday: "short" }), count, isToday: i === 0 };
  });
}

// "Move overdue to today": 6 PM today, or an hour from now if that has passed.
export function rescheduleTarget(now = new Date()) {
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  if (evening.getTime() > now.getTime()) return evening;
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  soon.setMinutes(Math.ceil(soon.getMinutes() / 15) * 15, 0, 0);
  return soon;
}

export function matchesFocus(task, focus, now = new Date()) {
  if (!focus || task.done) return true;
  if (focus.type === "overdue") return isOverdue(task, now);
  if (focus.type === "high") return task.priority === "High";
  if (focus.type === "today") return !isOverdue(task, now) && Boolean(task.due) && sameDay(new Date(task.due), now);
  if (focus.type === "day") {
    if (!task.due) return false;
    const due = new Date(task.due);
    const today = sameDay(now, new Date(focus.key));
    return today ? due.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() : sameDay(due, new Date(focus.key));
  }
  return true;
}
