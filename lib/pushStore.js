import { createECDH } from "node:crypto";

export async function redis(command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Reminder storage unavailable");
  const data = await response.json();
  if (data.error) throw new Error("Reminder storage unavailable");
  return data.result;
}
export const configured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY);
export async function vapidKeys(store = redis) {
  const key = "tm:push:vapid";
  let saved = await store(["GET", key]);
  if (!saved) {
    const pair = createECDH("prime256v1");
    pair.generateKeys();
    const keys = { publicKey: pair.getPublicKey().toString("base64url"), privateKey: pair.getPrivateKey().toString("base64url") };
    await store(["SET", key, JSON.stringify(keys), "NX"]);
    saved = await store(["GET", key]);
  }
  return JSON.parse(saved);
}
export async function sendPush(subscription, message, keys) {
  const { default: webpush } = await import("web-push");
  return webpush.sendNotification(subscription, JSON.stringify(message), {
    vapidDetails: { subject: "https://taskmind-five.vercel.app", ...keys }, TTL: 3600, timeout: 8000,
  });
}
