import test from "node:test";
import assert from "node:assert/strict";
import { mergeTasks, mergeDeleted } from "./taskMerge.js";

const NOW = 1_800_000_000_000;

test("keeps tasks added on both devices", () => {
  const { tasks } = mergeTasks([{ id: 1, title: "a", updatedAt: 5 }], [{ id: 2, title: "b", updatedAt: 6 }], {}, {}, NOW);
  assert.deepEqual(tasks.map((t) => t.id).sort(), [1, 2]);
});

test("newer edit of the same task wins in either direction", () => {
  const older = { id: 1, title: "old", updatedAt: 10 };
  const newer = { id: 1, title: "new", done: true, updatedAt: 20 };
  assert.equal(mergeTasks([older], [newer], {}, {}, NOW).tasks[0].title, "new");
  assert.equal(mergeTasks([newer], [older], {}, {}, NOW).tasks[0].title, "new");
});

test("edits to different tasks on two devices are both preserved", () => {
  const local = [{ id: 1, title: "A edited here", updatedAt: 30 }, { id: 2, title: "B", updatedAt: 1 }];
  const remote = [{ id: 1, title: "A", updatedAt: 1 }, { id: 2, title: "B edited there", updatedAt: 40 }];
  const { tasks } = mergeTasks(local, remote, {}, {}, NOW);
  assert.equal(tasks.find((t) => t.id === 1).title, "A edited here");
  assert.equal(tasks.find((t) => t.id === 2).title, "B edited there");
});

test("a deletion removes the task unless it was edited afterwards", () => {
  const remote = [{ id: 1, title: "a", updatedAt: NOW - 500 }, { id: 2, title: "b", updatedAt: NOW - 100 }];
  const { tasks } = mergeTasks([], remote, { 1: NOW - 300, 2: NOW - 300 }, {}, NOW);
  assert.deepEqual(tasks.map((t) => t.id), [2]);
});

test("tombstones merge by latest time and expire", () => {
  const merged = mergeDeleted({ 1: NOW - 5 }, { 1: NOW - 2, 2: NOW - 90 * 24 * 3600 * 1000 }, NOW);
  assert.deepEqual(merged, { 1: NOW - 2 });
});

test("does not duplicate tasks present on both sides", () => {
  const t = { id: 1, title: "a", updatedAt: 1 };
  assert.equal(mergeTasks([t], [t], {}, {}, NOW).tasks.length, 1);
});
