import { digest, reminderCandidates, verifyQStash } from "../lib/reminders.js";
import { configured, redis, sendPush, vapidKeys } from "../lib/pushStore.js";
import { randomUUID } from "node:crypto";

// Keep QStash's raw body intact for signature verification.
export const config = { api: { bodyParser: false } };
export function createReminderHandler({ store = redis, send = sendPush, now = Date.now, ready = configured } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!ready()) return res.status(503).json({ error: "Background reminders are not configured." });
    let raw = "";
    for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 4096) return res.status(413).json({ error: "Too large" }); }
    const url = `${process.env.TASKMIND_ORIGIN || "https://taskmind-five.vercel.app"}/api/reminders`;
    if (!verifyQStash(req.headers["upstash-signature"] || "", raw, url, [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY], now())) return res.status(401).json({ error: "Unauthorized" });
    let sent = 0, failures = 0;
    try {
      await store(["SET", "tm:push:lastCheck", String(now()), "EX", 86400]);
      const accounts = await store(["SMEMBERS", "tm:push:accounts"]);
      if (accounts.length > 100) return res.status(503).json({ error: "Reminder account limit reached." });
      if (!accounts.length) return res.status(200).json({ sent: 0 });
      const keys = await vapidKeys(store);
      for (const id of accounts) {
        const syncKey = await store(["GET", `tm:push:account:${id}`]);
        const rawBlob = syncKey && await store(["GET", syncKey]);
        if (!rawBlob) continue;
        const data = JSON.parse(rawBlob).data || {};
        const values = await store(["HGETALL", `tm:push:devices:${id}`]);
        for (let i = 0; i < values.length; i += 2) {
          const deviceId = values[i], device = JSON.parse(values[i + 1]);
          // Cap bursts after a device has been offline; process the remainder next run.
          const candidates = reminderCandidates(data, device, now());
          let delivered = 0;
          for (const message of candidates) {
            const key = `tm:push:sent:${id}:${deviceId}:${digest(message.key)}`;
            const token = randomUUID();
            if (!await store(["SET", key, token, "EX", 60, "NX"])) continue;
            try {
              await send(device.subscription, { title: message.title, body: message.body, tag: "tm-" + digest(message.key).slice(0, 24) }, keys);
              // Only a successful push submission receives the long dedupe TTL.
              await store(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('SET',KEYS[1],'sent','EX',ARGV[2]) end return 0", 1, key, token, 604800]);
              sent++; delivered++;
            } catch (error) {
              await store(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, key, token]);
              if ([404, 410].includes(error.statusCode)) { await store(["HDEL", `tm:push:devices:${id}`, deviceId]); break; }
              failures++;
            }
            if (delivered >= 3) break;
          }
        }
      }
      return res.status(failures ? 503 : 200).json({ sent, ...(failures ? { error: "Some reminders could not be delivered." } : {}) });
    } catch { return res.status(503).json({ error: "Reminder check failed. QStash may retry." }); }
  };
}
export default createReminderHandler();
