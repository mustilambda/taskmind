import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash, createECDH } from "node:crypto";
import { Readable } from "node:stream";
import { accountId, digest, reminderCandidates, validSubscription, verifyQStash } from "./reminders.js";
import { createReminderHandler } from "../api/reminders.js";
import { createPushHandler } from "../api/push.js";

const now = Date.parse("2026-11-15T20:00:00+05:00");
const signingKey = "test-only-signing-key";
const destination = "https://taskmind-five.vercel.app/api/reminders";
function sign(body = "{}", changes = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "Upstash", sub: destination, nbf: now / 1000 - 10, exp: now / 1000 + 60, body: createHash("sha256").update(body).digest("base64url"), ...changes })).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", signingKey).update(`${header}.${payload}`).digest("base64url")}`;
}
function memoryStore() {
  const strings = new Map(), hashes = new Map(), sets = new Map();
  return async ([command, key, ...args]) => {
    if (command === "GET") return strings.get(key) ?? null;
    if (command === "SET") { if (args.includes("NX") && strings.has(key)) return null; strings.set(key, args[0]); return "OK"; }
    if (command === "HSET") { const hash = hashes.get(key) || new Map(); hash.set(args[0], args[1]); hashes.set(key, hash); return 1; }
    if (command === "HGET") return hashes.get(key)?.get(args[0]) ?? null;
    if (command === "HDEL") return hashes.get(key)?.delete(args[0]);
    if (command === "HLEN") return hashes.get(key)?.size || 0;
    if (command === "HGETALL") return [...(hashes.get(key) || new Map())].flat();
    if (command === "SADD") { const set = sets.get(key) || new Set(); set.add(args[0]); sets.set(key, set); return 1; }
    if (command === "SREM") return sets.get(key)?.delete(args[0]);
    if (command === "SMEMBERS") return [...(sets.get(key) || [])];
    if (command === "EVAL") { const [, target, token, ttl] = args; if (strings.get(target) !== token) return 0; if (ttl) strings.set(target, "sent"); else strings.delete(target); return 1; }
    throw Error(`Unexpected command ${command}`);
  };
}
function response() { return { code: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } }; }
function request(signature = sign()) { const req = Readable.from([Buffer.from("{}")]); req.method="POST"; req.headers={"upstash-signature":signature}; return req; }
function sub() { const ec = createECDH("prime256v1"); ec.generateKeys(); return { endpoint: "https://fcm.googleapis.com/fcm/send/example-device", keys: { p256dh: ec.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } }; }

test("QStash signature binds body, destination, time and rolling signing keys", () => {
  const signature = sign();
  assert.equal(verifyQStash(signature, "{}", destination, ["old", signingKey], now), true);
  assert.equal(verifyQStash(signature, '{"changed":true}', destination, [signingKey], now), false);
  assert.equal(verifyQStash(signature, "{}", destination + "/other", [signingKey], now), false);
  assert.equal(verifyQStash(sign("{}", { exp: now/1000 - 1 }), "{}", destination, [signingKey], now), false);
  assert.equal(verifyQStash(sign("{}", { nbf: now/1000 + 60 }), "{}", destination, [signingKey], now), false);
});
test("subscriptions reject arbitrary destinations and malformed keys", () => {
  assert.equal(validSubscription(sub()), true);
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x"]) assert.equal(validSubscription({ ...sub(), endpoint }), false);
  assert.equal(validSubscription({ ...sub(), keys: { auth: "bad", p256dh: "bad" } }), false);
});
test("due and tonight notifications honor completion, ideas and switches", () => {
  const tasks = [
    { id: 1, title: "Due task", due: new Date(now - 60000).toISOString() },
    { id: 2, title: "Completed", done: true, due: new Date(now).toISOString() },
    { id: 3, title: "An idea", ideaStage: "later", due: new Date(now).toISOString() },
    { id: 4, title: "Future", due: new Date(now + 60000).toISOString() },
    { id: 5, title: "Tonight", planDate: "2026-11-15", estimateMinutes: 30 },
  ];
  const device = { timeZone: "Asia/Karachi", eveningStart: 1200 };
  const messages = reminderCandidates({ tasks, notify: { overdue: true } }, device, now);
  assert.deepEqual(messages.map((m) => m.body), ["Due: Due task", "Tonight"]);
  assert.equal(reminderCandidates({ tasks, notify: {} }, device, now).length, 0);
  assert.equal(reminderCandidates({ tasks, notify: { overdue: true } }, device, now + 24 * 3600000).length, 0);
});
test("daily summary uses device date and morning time", () => {
  const data = { tasks: [{ id: 1, title: "Morning task", due: "2026-11-15T12:00:00+05:00" }], notify: { daily: true } };
  assert.equal(reminderCandidates(data, {timeZone:"Asia/Karachi"}, Date.parse("2026-11-15T09:02:00+05:00")).length, 1);
  assert.equal(reminderCandidates(data, {timeZone:"Asia/Karachi"}, now).length, 0);
});
test("server registration, signed delivery, retry deduplication and unsubscribe work together", async () => {
  process.env.QSTASH_CURRENT_SIGNING_KEY = signingKey;
  const store = memoryStore(), delivered = [];
  const send = async (subscription, message) => delivered.push({subscription, message});
  const push = createPushHandler({store,send,ready:()=>true});
  const reminders = createReminderHandler({store,send,ready:()=>true,now:()=>now});
  const code="test-account", subscription=sub();
  await store(["SET", "tm:"+code, JSON.stringify({data:{tasks:[{id:1,title:"Write article",due:new Date(now).toISOString()}],notify:{overdue:true}}})]);
  let res=response(); await push({method:"GET"},res); assert.equal(res.body.configured,true); assert.equal(res.body.publicKey.length,87);
  res=response(); await push({method:"POST",body:{action:"subscribe",code,subscription,timeZone:"Asia/Karachi"}},res); assert.equal(res.body.enabled,true);
  res=response(); await reminders(request("invalid"),res); assert.equal(res.code,401); assert.equal(delivered.length,0);
  res=response(); await reminders(request(),res); assert.equal(res.code,200); assert.equal(res.body.sent,1);
  res=response(); await reminders(request(),res); assert.equal(res.body.sent,0); assert.equal(delivered.length,1);
  res=response(); await push({method:"POST",body:{action:"unsubscribe",code,endpoint:subscription.endpoint}},res); assert.equal(res.body.enabled,false);
  assert.deepEqual(await store(["SMEMBERS","tm:push:accounts"]),[]);
});
test("failed push is retried; expired subscriptions are removed", async () => {
  process.env.QSTASH_CURRENT_SIGNING_KEY=signingKey;
  const store=memoryStore(), code="retry-account", subscription=sub();
  await store(["SET","tm:"+code,JSON.stringify({data:{tasks:[{id:1,title:"Retry",due:new Date(now).toISOString()}],notify:{overdue:true}}})]);
  const push=createPushHandler({store,ready:()=>true});
  await push({method:"POST",body:{action:"subscribe",code,subscription}},response());
  let attempts=0;
  const handler=createReminderHandler({store,ready:()=>true,now:()=>now,send:async()=>{attempts++;if(attempts===1)throw Error("temporary");}});
  let res=response();await handler(request(),res);assert.equal(res.code,503);
  res=response();await handler(request(),res);assert.equal(res.body.sent,1);assert.equal(attempts,2);
  await store(["SET","tm:"+code,JSON.stringify({data:{tasks:[{id:2,title:"Gone",due:new Date(now).toISOString()}],notify:{overdue:true}}})]);
  const gone=createReminderHandler({store,ready:()=>true,now:()=>now,send:async()=>{throw Object.assign(Error("expired"),{statusCode:410});}});
  await gone(request(),response());
  assert.equal(await store(["HGET",`tm:push:devices:${accountId(code)}`,digest(subscription.endpoint)]),null);
});
