// Per-task merge for cross-device sync. Tasks carry an `updatedAt` stamp and
// deletions are remembered as tombstones ({ [id]: deletedAt }), so two devices
// editing different tasks no longer overwrite each other. Two devices editing
// the *same* task still resolve to the most recent edit (last write wins).
export const TOMBSTONE_TTL = 60 * 24 * 60 * 60 * 1000;

const stamp = (task) => Number(task?.updatedAt) || 0;

export function touch(task, now = Date.now()) {
  return { ...task, updatedAt: now };
}

export function mergeDeleted(a = {}, b = {}, now = Date.now()) {
  const out = {};
  for (const source of [a, b]) {
    for (const [id, at] of Object.entries(source || {})) {
      const ts = Number(at) || 0;
      if (now - ts > TOMBSTONE_TTL) continue;
      if (!out[id] || ts > out[id]) out[id] = ts;
    }
  }
  return out;
}

export function mergeTasks(local = [], remote = [], localDeleted = {}, remoteDeleted = {}, now = Date.now()) {
  const deleted = mergeDeleted(localDeleted, remoteDeleted, now);
  const localById = new Map(local.map((t) => [String(t.id), t]));
  const remoteById = new Map(remote.map((t) => [String(t.id), t]));

  const pick = (id) => {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && r) return stamp(l) > stamp(r) ? l : r; // tie → remote
    return l || r;
  };
  const alive = (task) => !(String(task.id) in deleted) || stamp(task) > deleted[String(task.id)];

  const remoteOnly = remote.filter((t) => !localById.has(String(t.id)));
  const ordered = [...remoteOnly, ...local];
  const seen = new Set();
  const tasks = [];
  for (const t of ordered) {
    const id = String(t.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const chosen = pick(id);
    if (alive(chosen)) tasks.push(chosen);
  }
  return { tasks, deleted };
}
