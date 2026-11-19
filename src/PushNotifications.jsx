import { useEffect, useRef, useState } from "react";

async function pushRequest(body) {
  const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not connect reminders.");
  return data;
}
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export default function PushNotifications({ c, code, onChange }) {
  const [config, setConfig] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previousCode = useRef(code);
  const subscription = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();
  useEffect(() => {
    let active = true;
    async function check() {
      setEnabled(false); onChange(false);
      if (!supported()) return;
      try {
        const response = await fetch("/api/push");
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;
        setConfig(data);
        const sub = await subscription();
        if (previousCode.current && previousCode.current !== code && sub) await pushRequest({ action: "unsubscribe", code: previousCode.current, endpoint: sub.endpoint });
        previousCode.current = code;
        if (sub && code && data.configured) {
          const status = await pushRequest({ action: "status", code, endpoint: sub.endpoint });
          if (active) { setEnabled(status.enabled); onChange(status.enabled); }
        }
      } catch { if (active) setMessage("Background reminder status unavailable. Try again when connected."); }
    }
    check();
    return () => { active = false; };
  }, [code, onChange]);
  async function enable() {
    setBusy(true); setMessage("");
    try {
      if (await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your phone's site settings.");
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - config.publicKey.length % 4) % 4)), (char) => char.charCodeAt(0));
      if (!sub) sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      let eveningStart = 1200;
      try { const start = JSON.parse(localStorage.getItem("taskmind.eveningWindow"))?.start; if (start) { const [h,m] = start.split(":").map(Number); eveningStart = h * 60 + m; } } catch {}
      await pushRequest({ action: "subscribe", code, subscription: sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, eveningStart });
      setEnabled(true); onChange(true); setMessage("Phone connected. Use Send test to check delivery.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function action(type) {
    setBusy(true); setMessage("");
    try {
      const sub = await subscription();
      if (!sub) throw new Error("Enable background reminders again.");
      await pushRequest({ action: type, code, endpoint: sub.endpoint });
      if (type === "unsubscribe") { await sub.unsubscribe(); setEnabled(false); onChange(false); setMessage("Background reminders off on this device."); }
      else setMessage("Test sent through the server.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const button = { background: c.accent, color: "#fff", border: 0, borderRadius: 9, padding: "9px 12px", fontSize: 12, cursor: "pointer", opacity: busy ? .5 : 1 };
  return <div style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
    <strong style={{ fontSize: 13 }}>Reminders while the app is closed</strong>
    <p style={{ color: c.sub, fontSize: 12, lineHeight: 1.5, margin: "7px 0 12px" }}>{!supported() ? "This browser doesn't support background push notifications." : !code ? "Connect sync below first, so the server can check your tasks." : config?.configured === false ? "Server setup is still needed. Background reminders aren't active yet." : enabled ? (config?.schedulerActive ? "Connected on this device. Checks run about every two minutes." : "Phone connected. Waiting for the background scheduler to run.") : "Enable on this phone to receive due-task and tonight-plan reminders."}</p>
    {supported() && code && config?.configured && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {enabled ? <><button disabled={busy} onClick={() => action("test")} style={button}>Send test</button><button disabled={busy} onClick={() => action("unsubscribe")} style={{ ...button, background: c.seg, color: c.text }}>Turn off</button></> : <button disabled={busy} onClick={enable} style={button}>{busy ? "Connecting…" : "Enable background reminders"}</button>}
    </div>}
    {message && <p role="status" style={{ color: c.sub, fontSize: 12, marginBottom: 0 }}>{message}</p>}
  </div>;
}
