import { accountId, digest, validCode, validSubscription } from "../lib/reminders.js";
import { configured, redis, sendPush, vapidKeys } from "../lib/pushStore.js";

export function createPushHandler({ store = redis, send = sendPush, ready = configured } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
    if (!ready()) return res.status(req.method === "GET" ? 200 : 503).json({ configured: false, error: "Background reminders need server setup first." });
    try {
      if (req.method === "GET") {
        const keys = await vapidKeys(store);
        const lastCheck = Number(await store(["GET", "tm:push:lastCheck"]) || 0);
        return res.status(200).json({ configured: true, publicKey: keys.publicKey, schedulerActive: Date.now() - lastCheck < 10 * 60000 });
      }
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if (!validCode(body.code)) return res.status(400).json({ error: "Connect sync first." });
      const id = accountId(body.code);
      const blob = await store(["GET", "tm:" + body.code.toLowerCase()]);
      if (!blob) return res.status(404).json({ error: "Sync your tasks first, then try again." });
      if (typeof body.endpoint !== "string" && !body.subscription?.endpoint) return res.status(400).json({ error: "Missing device subscription." });
      const endpoint = body.subscription?.endpoint || body.endpoint;
      const deviceId = digest(endpoint);
      const devicesKey = `tm:push:devices:${id}`;
      if (body.action === "status") return res.status(200).json({ enabled: Boolean(await store(["HGET", devicesKey, deviceId])) });
      if (body.action === "unsubscribe") {
        await store(["HDEL", devicesKey, deviceId]);
        if (await store(["HLEN", devicesKey]) === 0) await store(["SREM", "tm:push:accounts", id]);
        return res.status(200).json({ enabled: false });
      }
      if (body.action === "test") {
        const device = await store(["HGET", devicesKey, deviceId]);
        if (!device) return res.status(400).json({ error: "Enable background reminders first." });
        const limit = await store(["SET", `tm:push:test:${deviceId}`, "1", "EX", 30, "NX"]);
        if (!limit) return res.status(429).json({ error: "Wait 30 seconds before testing again." });
        await send(JSON.parse(device).subscription, { title: "TaskMind", body: "Background notifications are connected.", tag: "tm-push-test" }, await vapidKeys(store));
        return res.status(200).json({ ok: true });
      }
      if (body.action !== "subscribe" || !validSubscription(body.subscription)) return res.status(400).json({ error: "Invalid push subscription." });
      const timeZone = body.timeZone || "Asia/Karachi";
      try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { return res.status(400).json({ error: "Invalid time zone." }); }
      const existing = await store(["HGET", devicesKey, deviceId]);
      if (!existing && await store(["HLEN", devicesKey]) >= 5) return res.status(400).json({ error: "Five devices are already registered." });
      const previousAccount = await store(["GET", `tm:push:owner:${deviceId}`]);
      if (previousAccount && previousAccount !== id) await store(["HDEL", `tm:push:devices:${previousAccount}`, deviceId]);
      await store(["SET", `tm:push:owner:${deviceId}`, id]);
      await store(["HSET", devicesKey, deviceId, JSON.stringify({ subscription: body.subscription, timeZone, eveningStart: Number.isInteger(body.eveningStart) && body.eveningStart >= 0 && body.eveningStart < 1440 ? body.eveningStart : 1200 })]);
      await store(["SET", `tm:push:account:${id}`, "tm:" + body.code.toLowerCase()]);
      await store(["SADD", "tm:push:accounts", id]);
      return res.status(200).json({ enabled: true });
    } catch { return res.status(503).json({ error: "Could not connect background reminders. Try again." }); }
  };
}
export default createPushHandler();
