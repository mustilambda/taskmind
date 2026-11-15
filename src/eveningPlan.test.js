import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, eveningPlan } from "./eveningPlan.js";

test("only tonight's scheduled tasks consume space, in the order they were added", () => {
  const tasks = [
    { id: 1, planDate: "2026-11-15", estimateMinutes: 60, planOrder: 2 },
    { id: 2, planDate: "2026-11-15", estimateMinutes: 30, planOrder: 1, done: true },
    { id: 3, planDate: "2026-11-14", estimateMinutes: 90 },
    { id: 4, ideaStage: "later", estimateMinutes: 90 },
  ];
  const plan = eveningPlan(tasks, "2026-11-15", "20:00", "23:00");
  assert.equal(plan.free, 90);
  assert.deepEqual(plan.slots.map((s) => [s.task.id, s.start, s.end]), [[2, 1200, 1230], [1, 1230, 1290]]);
  assert.equal(eveningPlan(tasks, "2026-11-16", "20:00", "23:00").used, 0);
});

test("changing estimates or shrinking the window exposes overbooking", () => {
  const tasks = [{ planDate: "today", estimateMinutes: 120 }, { planDate: "today", estimateMinutes: 90 }];
  assert.equal(eveningPlan(tasks, "today", "20:00", "23:00").over, 30);
  assert.equal(eveningPlan(tasks, "today", "20:00", "23:00").free, 0);
  assert.equal(eveningPlan(tasks, "today", "22:00", "23:00").over, 150);
});

test("bad windows and invalid estimates cannot create phantom capacity", () => {
  for (const [start, end] of [["23:00", "20:00"], ["", "23:00"], ["25:00", "23:00"], ["20:00", "20:00"]]) {
    const plan = eveningPlan([], "today", start, end);
    assert.equal(plan.valid, false);
    assert.equal(plan.free, 0);
  }
  assert.equal(eveningPlan([{ planDate: "today", estimateMinutes: -20 }], "today", "20:00", "23:00").used, 30);
  assert.equal(dayKey(new Date(2026, 10, 15, 23, 59)), "2026-11-15");
});
