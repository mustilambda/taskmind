// Vercel serverless function — private cross-device sync.
// Stores one small JSON blob per "sync code" in Upstash Redis. The code is the
// only secret; anyone with it can read the data, so users keep it private.
// Credentials live server-side and are never exposed to the browser.

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 60 * 60 * 24 * 365; // refresh a 1-year expiry on every push

async function redis(cmd) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return j.result;
}

const validCode = (c) => typeof c === "string" && /^[a-z0-9-]{4,48}$/i.test(c);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!URL || !TOKEN) {
    res.status(500).json({ error: "Sync not configured" });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { action, code } = body;
    if (!validCode(code)) {
      res.status(400).json({ error: "Invalid code" });
      return;
    }
    const key = "tm:" + code.toLowerCase();

    if (action === "pull") {
      const v = await redis(["GET", key]);
      res.status(200).json({ blob: v ? JSON.parse(v) : null });
      return;
    }

    if (action === "push") {
      if (typeof body.data === "undefined") {
        res.status(400).json({ error: "Missing data" });
        return;
      }
      const updatedAt = Date.now();
      const payload = JSON.stringify({ data: body.data, updatedAt });
      // guard against runaway payloads (~1MB)
      if (payload.length > 1_000_000) {
        res.status(413).json({ error: "Too large" });
        return;
      }
      await redis(["SET", key, payload, "EX", TTL]);
      res.status(200).json({ ok: true, updatedAt });
      return;
    }

    if (action === "exists") {
      const v = await redis(["EXISTS", key]);
      res.status(200).json({ exists: !!v });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
