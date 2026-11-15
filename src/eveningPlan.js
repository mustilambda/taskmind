export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function minutesOf(time) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}

export function estimate(task) {
  const value = Number(task.estimateMinutes);
  return Number.isFinite(value) && value >= 5 && value <= 360 ? Math.round(value) : 30;
}

export function eveningPlan(tasks, date, start, end) {
  const from = minutesOf(start), to = minutesOf(end);
  const valid = Number.isFinite(from) && Number.isFinite(to) && to > from;
  const capacity = valid ? to - from : 0;
  let cursor = from;
  const slots = tasks.filter((t) => t.planDate === date && !t.ideaStage).sort((a, b) => (a.planOrder || 0) - (b.planOrder || 0)).map((task) => {
    const duration = estimate(task);
    const slot = { task, start: cursor, end: cursor + duration, duration };
    cursor += duration;
    return slot;
  });
  const used = slots.reduce((sum, slot) => sum + slot.duration, 0);
  return { valid, capacity, slots, used, free: Math.max(0, capacity - used), over: Math.max(0, used - capacity) };
}
