import { useState } from "react";

// Contact page (/contact). Reuses the contact channels + Web3Forms backend
// from the portfolio site, styled to match the TaskMind landing page.
const C = {
  bg: "#F2EBDC", bg2: "#EDE5D3", text: "#211C16", sub: "#6E675B", faint: "#948B79",
  line: "#E2D7C2", accent: "#BE3A2E", green: "#3F9D5C",
};

const WEB3FORMS_KEY = "059dbb36-4486-441f-a802-47c8b1ba5da1";

const CHANNELS = [
  { i: "✉️", t: "Email", v: "itsmustansarmahmood@gmail.com", href: "mailto:itsmustansarmahmood@gmail.com" },
  { i: "💬", t: "WhatsApp", v: "+92 300 0853448 · fastest reply", href: "https://wa.me/923000853448" },
  { i: "in", t: "LinkedIn", v: "/in/mustansarmahmood", href: "https://linkedin.com/in/mustansarmahmood" },
  { i: "📅", t: "Book a call", v: "30-min slot on Calendly", href: "https://calendly.com/itsmustansarmahmood/30min" },
];

const REASONS = ["Feedback on TaskMind", "Report a bug", "Feature request", "Work / hiring inquiry", "Something else"];

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", reason: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | ok | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.email.trim() || !form.message.trim()) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          name: form.name.trim() || "TaskMind visitor",
          email: form.email.trim(),
          subject: "TaskMind Contact: " + (form.reason || "General"),
          message: "Reason: " + (form.reason || "Not specified") + "\n\n" + form.message.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("ok");
        setForm({ name: "", email: "", reason: "", message: "" });
      } else setStatus("error");
    } catch (e) {
      setStatus("error");
    }
  };

  return (
    <div className="ct">
      <style>{`
        .ct { background:${C.bg}; color:${C.text}; min-height:100vh; font-family:'Space Grotesk',-apple-system,sans-serif; line-height:1.6; position:relative; overflow-x:hidden; }
        .ct::before { content:''; position:absolute; top:-120px; right:-160px; width:520px; height:520px; border-radius:50%; background:radial-gradient(circle, rgba(190,58,46,.10), transparent 68%); pointer-events:none; }
        .ct a { color:inherit; text-decoration:none; }
        .ct-wrap { max-width:1080px; margin:0 auto; padding:0 24px; position:relative; z-index:1; }
        .ct-nav { display:flex; align-items:center; justify-content:space-between; padding:20px 24px; max-width:1080px; margin:0 auto; position:relative; z-index:2; }
        .ct-logo { font-family:'Instrument Serif',Georgia,serif; font-style:italic; font-size:24px; letter-spacing:-0.01em; }
        .ct-nav-r { display:flex; align-items:center; gap:20px; }
        .ct-link { color:${C.sub}; font-size:14px; font-weight:500; }
        .ct-link:hover { color:${C.accent}; }
        .ct-btn { display:inline-flex; align-items:center; gap:8px; background:${C.accent}; color:#fff; font-weight:600; font-size:14px; padding:11px 20px; border-radius:50px; transition:transform .15s, box-shadow .15s; box-shadow:0 4px 16px rgba(190,58,46,.25); border:none; cursor:pointer; font-family:inherit; }
        .ct-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(190,58,46,.38); }
        .ct-btn:disabled { opacity:.6; cursor:default; transform:none; }

        .ct-head { text-align:center; padding:44px 0 8px; }
        .ct-tag { display:inline-flex; align-items:center; gap:8px; background:#F7DEDE; color:${C.accent}; font-size:12px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; padding:6px 14px; border-radius:50px; margin-bottom:18px; }
        .ct-head h1 { font-family:'Instrument Serif',Georgia,serif; font-size:clamp(2.4rem,5vw,3.6rem); line-height:1.05; letter-spacing:-0.02em; margin:0 0 14px; }
        .ct-head h1 em { color:${C.accent}; font-style:italic; }
        .ct-head p { color:${C.sub}; max-width:480px; margin:0 auto; }

        .ct-grid { display:grid; grid-template-columns:0.85fr 1.15fr; gap:30px; padding:44px 0 72px; align-items:start; }
        .ct-card { background:${C.bg2}; border:1px solid ${C.line}; border-radius:18px; padding:18px 20px; display:flex; align-items:center; gap:14px; transition:transform .2s, border-color .2s; margin-bottom:14px; }
        .ct-card:hover { transform:translateY(-3px); border-color:${C.accent}; }
        .ct-ic { width:42px; height:42px; flex-shrink:0; border-radius:12px; background:#fff; border:1px solid ${C.line}; display:flex; align-items:center; justify-content:center; font-size:19px; font-weight:700; color:${C.accent}; }
        .ct-card-t { font-size:13px; font-weight:600; }
        .ct-card-v { font-size:12.5px; color:${C.sub}; margin-top:2px; word-break:break-word; }

        .ct-form { background:#fff; border:1px solid ${C.line}; border-radius:22px; padding:28px; box-shadow:0 24px 60px rgba(40,28,18,.10); }
        .ct-form h2 { font-family:'Instrument Serif',serif; font-style:italic; font-size:24px; margin:0 0 18px; }
        .ct-field { margin-bottom:14px; }
        .ct-label { font-size:12px; font-weight:600; color:${C.text}; opacity:.85; margin-bottom:6px; display:block; }
        .ct-input, .ct-select, .ct-area { width:100%; border:1px solid ${C.line}; border-radius:11px; background:${C.bg}; padding:11px 13px; font-family:inherit; font-size:14px; color:${C.text}; outline:none; transition:border-color .15s; }
        .ct-input:focus, .ct-select:focus, .ct-area:focus { border-color:${C.accent}; }
        .ct-area { resize:vertical; min-height:110px; line-height:1.5; }
        .ct-row { display:flex; gap:12px; }
        .ct-row > * { flex:1; }
        .ct-note { font-size:12px; color:${C.faint}; margin-top:12px; }
        .ct-ok { background:#E6F4E8; color:${C.green}; border:1px solid #c7e6cc; border-radius:11px; padding:12px 14px; font-size:13px; font-weight:500; margin-top:12px; }
        .ct-err { color:${C.accent}; font-size:13px; margin-top:10px; }

        .ct-foot { text-align:center; color:${C.faint}; font-size:12.5px; padding:0 0 50px; }
        .ct-foot a { color:${C.accent}; font-weight:600; }

        @media (max-width:780px) { .ct-grid { grid-template-columns:1fr; } .ct-row { flex-direction:column; } }
      `}</style>

      <nav className="ct-nav">
        <a className="ct-logo" href="/">TaskMind</a>
        <div className="ct-nav-r">
          <a className="ct-link" href="/">Home</a>
          <a className="ct-btn" href="/app">Open app →</a>
        </div>
      </nav>

      <header className="ct-head">
        <div className="ct-wrap">
          <span className="ct-tag">● Contact</span>
          <h1>Let's <em>talk.</em></h1>
          <p>Questions, feedback, a bug, or a project in mind? Reach out any way you like — I usually reply within 24 hours.</p>
        </div>
      </header>

      <div className="ct-wrap">
        <div className="ct-grid">
          <div>
            {CHANNELS.map((ch) => (
              <a className="ct-card" href={ch.href} target="_blank" rel="noopener" key={ch.t}>
                <span className="ct-ic">{ch.i}</span>
                <span>
                  <span className="ct-card-t">{ch.t}</span>
                  <span className="ct-card-v" style={{ display: "block" }}>{ch.v}</span>
                </span>
              </a>
            ))}
          </div>

          <div className="ct-form">
            <h2>Send a message</h2>
            <div className="ct-row">
              <div className="ct-field">
                <label className="ct-label">Name</label>
                <input className="ct-input" placeholder="Your name" value={form.name} onChange={set("name")} />
              </div>
              <div className="ct-field">
                <label className="ct-label">Email *</label>
                <input className="ct-input" type="email" placeholder="you@email.com" value={form.email} onChange={set("email")} />
              </div>
            </div>
            <div className="ct-field">
              <label className="ct-label">What's it about?</label>
              <select className="ct-select" value={form.reason} onChange={set("reason")}>
                <option value="">Choose one</option>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="ct-field">
              <label className="ct-label">Message *</label>
              <textarea className="ct-area" placeholder="Tell me what's on your mind…" value={form.message} onChange={set("message")} />
            </div>
            <button className="ct-btn" onClick={submit} disabled={status === "sending"} style={{ width: "100%", justifyContent: "center", padding: "13px 0" }}>
              {status === "sending" ? "Sending…" : status === "ok" ? "Sent ✓" : "Send message →"}
            </button>
            {status === "ok" && <div className="ct-ok">✅ Message sent! I'll get back to you soon — for faster replies, WhatsApp is best.</div>}
            {status === "error" && <div className="ct-err">Please add your email and a message (or reach out via WhatsApp / email directly).</div>}
            <p className="ct-note">⚡ Typically replies within 24 hours.</p>
          </div>
        </div>
      </div>

      <footer className="ct-foot">
        TaskMind · made for the way you work · <a href="/app">Launch the app</a>
      </footer>
    </div>
  );
}
