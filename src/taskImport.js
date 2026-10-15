// Use a URL fragment so task details are not sent to the hosting server.
export function readTaskImport(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("tasks")) return null;
  try {
    const raw = params.get("tasks");
    if (raw.length > 20000) throw new Error("This task link is too large.");
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error("A link must contain between 1 and 50 tasks.");
    const tasks = items.map((item) => {
      if (!item || typeof item.title !== "string" || !item.title.trim() || item.title.length > 400) throw new Error("Each task needs a title of up to 400 characters.");
      if (item.due && (typeof item.due !== "string" || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(item.due) || !Number.isFinite(Date.parse(item.due)))) throw new Error("Task dates must include a time zone.");
      return {
        title: item.title.trim(),
        due: item.due ? new Date(item.due).toISOString() : "",
        category: typeof item.category === "string" ? item.category.trim().slice(0, 24) : "General",
        priority: ["High", "Medium", "Low"].includes(item.priority) ? item.priority : "Medium",
        reason: typeof item.description === "string" ? item.description.slice(0, 1000) : "Imported from a task link.",
        done: false, pending: false,
      };
    });
    return { tasks };
  } catch (error) {
    return { error: error instanceof SyntaxError ? "This task link is invalid. Ask for a new link." : error.message };
  }
}

export function uniqueImportedTasks(incoming, existing) {
  const key = (t) => JSON.stringify([t.title.trim().toLowerCase().replace(/\s+/g, " "), t.due ? new Date(t.due).toISOString() : ""]);
  const seen = new Set(existing.map(key));
  return incoming.filter((task) => {
    const signature = key(task);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

// Preserve imports that have not yet been acknowledged by the sync server.
// An existing ID wins, including remote edits/completion of the imported task.
export function mergePendingImports(remote, pending = [], local = pending) {
  const ids = new Set(remote.map((task) => task.id));
  const pendingIds = new Set(pending.map((task) => task.id));
  return [...uniqueImportedTasks(local.filter((task) => pendingIds.has(task.id) && !ids.has(task.id)), remote), ...remote];
}
