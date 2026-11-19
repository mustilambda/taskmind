import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
export const accountId = (code) => digest(code.toLowerCase());
export const validCode = (code) => typeof code === "string" && /^[a-z0-9-]{4,48}$/i.test(code);
export function validSubscription(subscription) {
  try {
    const url = new URL(subscription.endpoint);
    const hosts = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com", "wns.windows.com"];
    const trusted = hosts.some((host) => url.hostname === host || url.hostname.endsWith("." + host));
    return trusted && url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      /^[A-Za-z0-9_-]{87}={0,2}$/.test(subscription.keys?.p256dh || "") &&
      /^[A-Za-z0-9_-]{22}={0,2}$/.test(subscription.keys?.auth || "");
  } catch { return false; }
}
export function zonedClock(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function reminderCandidates(data, device, now = Date.now()) {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const notify = data.notify || {};
  const local = zonedClock(new Date(now), device.timeZone || "Asia/Karachi");
  const active = tasks.filter((t) => !t.done && !t.pending && !t.ideaStage);
  const out = [];
  for (const task of active) {
    const due = Date.parse(task.due);
    if (Number.isFinite(due) && due <= now && now - due < 12 * 3600000 && (notify.overdue || (notify.priority && task.priority === "High"))) {
      out.push({ key: `due:${task.id}:${due}`, title: "TaskMind", body: `Due: ${String(task.title).slice(0, 200)}` });
    }
  }
  let cursor = device.eveningStart || 20 * 60;
  for (const task of tasks.filter((t) => t.planDate === local.day && !t.ideaStage).sort((a,b) => (a.planOrder || 0) - (b.planOrder || 0))) {
    if (!task.done && notify.overdue && local.minute >= cursor && local.minute - cursor < 60) {
      out.push({ key: `plan:${task.id}:${local.day}:${cursor}`, title: "Tonight's plan", body: String(task.title).slice(0, 200) });
    }
    const minutes = Number(task.estimateMinutes);
    cursor += Number.isFinite(minutes) && minutes >= 5 && minutes <= 360 ? minutes : 30;
  }
  if (notify.daily && local.minute >= 9 * 60 && local.minute < 10 * 60) {
    const today = active.filter((t) => t.planDate === local.day || (t.due && zonedClock(new Date(t.due), device.timeZone).day === local.day));
    if (today.length) out.push({ key: `daily:${local.day}`, title: "Your day in TaskMind", body: `${today.length} task${today.length === 1 ? "" : "s"} for today. First: ${String(today[0].title).slice(0, 160)}` });
  }
  return out;
}
// QStash signs every request. Verify signature, expiry, audience and exact body.
export function verifyQStash(signature, body, url, keys, now = Date.now()) {
  try {
    const [header, payload, signaturePart, extra] = signature.split(".");
    if (extra || !signaturePart || JSON.parse(Buffer.from(header, "base64url")).alg !== "HS256") return false;
    const expected = Buffer.from(signaturePart, "base64url");
    const signed = keys.filter(Boolean).some((key) => {
      const actual = createHmac("sha256", key).update(`${header}.${payload}`).digest();
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!signed) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    const seconds = now / 1000;
    return claims.iss === "Upstash" && claims.sub === url && Number.isFinite(claims.exp) && claims.exp > seconds && Number.isFinite(claims.nbf) && claims.nbf <= seconds + 10 &&
      String(claims.body).replace(/=+$/, "") === createHash("sha256").update(body).digest("base64url");
  } catch { return false; }
}
