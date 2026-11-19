import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTasks, weekOutlook, rescheduleTarget, matchesFocus } from "./dashboard.js";

const now = new Date(2026, 10, 19, 14, 0); // Thu 19 Nov 2026, 2 PM local
const at = (d, h = 10) => new Date(2026, 10, d, h, 0).toISOString();

const tasks = [
  { id: 1, title: "late", due: at(18), done: false, priority: "Medium" },
  { id: 2, title: "today", due: at(19, 17), done: false, priority: "High" },
  { id: 3, title: "later", due: at(22), done: false },
  { id: 4, title: "done today", done: true, completedAt: now.getTime() - 3600000 },
  { id: 5, title: "done long ago", done: true, completedAt: now.getTime() - 20 * 86400000 },
  { id: 6, title: "idea", ideaStage: "later", done: false },
];

test("counts open, overdue, due today and high priority", () => {
  const s = summarizeTasks(tasks, now);
  assert.equal(s.open.length, 3);
  assert.equal(s.overdue.length, 1);
  assert.equal(s.dueToday.length, 1);
  assert.equal(s.high.length, 1);
  assert.equal(s.nextTask.id, 1);
  assert.equal(s.nextOverdue, true);
});

test("progress only counts what was finished today", () => {
  const s = summarizeTasks(tasks, now);
  assert.equal(s.doneToday.length, 1);
  assert.equal(s.todayTotal, 4);
  assert.equal(s.progress, 25);
});

test("old completed tasks without a completion date do not move the ring", () => {
  const s = summarizeTasks([{ id: 1, done: true }, { id: 2, done: false, due: at(25) }], now);
  assert.equal(s.progress, 0);
  assert.equal(s.todayTotal, 1);
});

test("week outlook puts overdue on today and counts each day", () => {
  const week = weekOutlook(tasks, now);
  assert.equal(week.length, 7);
  assert.equal(week[0].count, 2); // overdue + due today
  assert.equal(week[3].count, 1); // Sunday 22nd
  assert.equal(week[0].isToday, true);
});

test("reschedule target is later than now", () => {
  assert.ok(rescheduleTarget(now).getTime() > now.getTime());
  assert.equal(rescheduleTarget(now).getHours(), 18);
  const late = new Date(2026, 10, 19, 20, 10);
  assert.ok(rescheduleTarget(late).getTime() > late.getTime());
});

test("focus filters narrow the list", () => {
  const open = tasks.filter((t) => !t.done && !t.ideaStage);
  assert.deepEqual(open.filter((t) => matchesFocus(t, { type: "overdue" }, now)).map((t) => t.id), [1]);
  assert.deepEqual(open.filter((t) => matchesFocus(t, { type: "today" }, now)).map((t) => t.id), [2]);
  assert.deepEqual(open.filter((t) => matchesFocus(t, { type: "high" }, now)).map((t) => t.id), [2]);
  assert.deepEqual(open.filter((t) => matchesFocus(t, { type: "day", key: new Date(2026, 10, 22).toDateString() }, now)).map((t) => t.id), [3]);
});
