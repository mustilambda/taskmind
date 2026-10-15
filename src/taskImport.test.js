import test from "node:test";
import assert from "node:assert/strict";
import { readTaskImport, uniqueImportedTasks, mergePendingImports } from "./taskImport.js";

const link = (tasks) => "#tasks=" + encodeURIComponent(JSON.stringify(tasks));
test("joining sync retains unacknowledged imports and remote tasks without duplicates", () => {
  const pending = [{ id: "import", title: "Walk", due: "" }];
  const remote = [{ id: 1, title: "Work", due: "" }];
  assert.equal(mergePendingImports(remote, pending).length, 2);
  assert.equal(mergePendingImports([...remote, ...pending], pending).length, 2);
  assert.equal(mergePendingImports([{ ...pending[0], done: true }], pending)[0].done, true);
  assert.equal(mergePendingImports(remote, pending, []).length, 1);
  assert.equal(mergePendingImports(remote, pending, [{ ...pending[0], title: "Edited walk" }])[0].title, "Edited walk");
});
test("imports Unicode and converts explicit timezone dates", () => {
  const result = readTaskImport(link([{ title: "Español 📚", due: "2026-10-15T22:30:00+05:00", done: true, id: 123 }]));
  assert.equal(result.tasks[0].due, "2026-10-15T17:30:00.000Z");
  assert.equal(result.tasks[0].done, false);
  assert.equal(result.tasks[0].id, undefined);
});
test("rejects broken payloads and ambiguous dates without partial imports", () => {
  for (const hash of ["#tasks=nope", link([]), link([{ title: "Fine" }, { title: "" }]), link([{ title: "Walk", due: "2026-10-15T22:00:00" }]), link(Array(51).fill({ title: "Task" }))]) {
    assert.ok(readTaskImport(hash).error);
  }
  assert.equal(readTaskImport(""), null);
});
test("skips duplicates across the link and stored tasks but keeps different times", () => {
  const incoming = [{ title: " Walk ", due: "" }, { title: "Walk", due: "" }, { title: "Walk", due: "2026-10-15T17:00:00Z" }];
  assert.equal(uniqueImportedTasks(incoming, [{ title: "walk", due: "" }]).length, 1);
  assert.equal(uniqueImportedTasks(incoming, []).length, 2);
});
