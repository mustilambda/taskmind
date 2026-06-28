// Marketing + how-to homepage. Lives at "/"; the app lives at "/app".
const C = {
  bg: "#F2EBDC", bg2: "#EDE5D3", text: "#211C16", sub: "#6E675B", faint: "#948B79",
  line: "#E2D7C2", accent: "#BE3A2E", green: "#3F9D5C", purple: "#7C5BD0", blue: "#3B7DD8",
};

const STEPS = [
  { n: "1", t: "Type it like you'd say it", d: "“Email Sam tomorrow at 5pm” or “fix the signup bug urgent”. No forms, no dropdowns — just write the task in plain language." },
  { n: "2", t: "AI sorts it instantly", d: "TaskMind reads it and files it with the right category, priority and due date — and tells you why. Categories build themselves around how you work." },
  { n: "3", t: "It reads the date for you", d: "Times and dates anywhere in the sentence (“by Friday 9am”, “in 2 hours”) become a real reminder. “Tomorrow” rolls over to “Today” on its own." },
  { n: "4", t: "Get nudged, stay synced", d: "Browser notifications nudge you when a task is due. One private code keeps your phone and PC in sync — no account, ever." },
];

const FEATURES = [
  { i: "🧠", t: "AI that organizes for you", d: "Powered by Groq + Llama 3.3 — sorts by category, priority and deadline with a one-line reason for every call." },
  { i: "✨", t: "A dashboard with personality", d: "A witty headline reads your whole list — roasts you when you're buried, hypes you when you're close, celebrates when you hit zero." },
  { i: "🗂️", t: "Categories that build themselves", d: "No rigid folders. Tabs appear as the AI discovers how you actually work — and you can rename any of them." },
  { i: "⏰", t: "Live, self-updating dates", d: "Labels update with the calendar and flip to a red Overdue badge the moment a deadline passes." },
  { i: "🔒", t: "Your data stays yours", d: "Everything lives on your device by default. No login, no tracking — sync only when you choose, via a private code." },
  { i: "📲", t: "Installable PWA", d: "Add it to your home screen and it works like a native app, on phone and desktop." },
];

export default function Landing() {
  return (
    <div className="lp">
      <style>{`
        .lp { background:${C.bg}; color:${C.text}; min-height:100vh; font-family:'Space Grotesk',-apple-system,sans-serif; line-height:1.6; }
        .lp a { color:inherit; text-decoration:none; }
        .lp-wrap { max-width:1040px; margin:0 auto; padding:0 24px; }
        .lp-nav { display:flex; align-items:center; justify-content:space-between; padding:22px 24px; max-width:1040px; margin:0 auto; }
        .lp-logo { font-family:'Instrument Serif',Georgia,serif; font-style:italic; font-size:24px; letter-spacing:-0.01em; }
        .lp-btn { display:inline-flex; align-items:center; gap:8px; background:${C.accent}; color:#fff; font-weight:600; font-size:14px; padding:11px 20px; border-radius:50px; transition:transform .15s, box-shadow .15s; box-shadow:0 4px 16px rgba(190,58,46,.25); }
        .lp-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(190,58,46,.38); }
        .lp-btn-ghost { background:transparent; color:${C.text}; border:1px solid ${C.line}; box-shadow:none; }
        .lp-btn-ghost:hover { border-color:${C.accent}; color:${C.accent}; box-shadow:none; }

        .lp-hero { text-align:center; padding:56px 0 32px; }
        .lp-tag { display:inline-flex; align-items:center; gap:8px; background:#F7DEDE; color:${C.accent}; font-size:12.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; padding:6px 14px; border-radius:50px; margin-bottom:22px; }
        .lp-dot { width:7px; height:7px; border-radius:50%; background:${C.accent}; }
        .lp-hero h1 { font-family:'Instrument Serif',Georgia,serif; font-size:clamp(2.6rem,6vw,4.4rem); line-height:1.05; letter-spacing:-0.02em; margin:0 0 18px; }
        .lp-hero h1 em { color:${C.accent}; font-style:italic; }
        .lp-hero p { font-size:clamp(1rem,2.4vw,1.2rem); color:${C.sub}; max-width:560px; margin:0 auto 30px; }
        .lp-actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }

        .lp-mock { margin:48px auto 0; max-width:380px; background:#fff; border:1px solid ${C.line}; border-radius:24px; box-shadow:0 30px 70px rgba(0,0,0,.14); overflow:hidden; text-align:left; }
        .lp-mock-head { padding:18px 20px 8px; }
        .lp-mock-h { font-family:'Instrument Serif',serif; font-style:italic; font-size:22px; line-height:1.15; }
        .lp-mock-sub { color:${C.faint}; font-size:12px; margin-top:8px; }
        .lp-row { display:flex; gap:11px; padding:13px 20px; border-top:1px solid ${C.line}; align-items:flex-start; }
        .lp-check { width:17px; height:17px; border-radius:50%; border:1.5px solid #CABFA9; flex-shrink:0; margin-top:2px; }
        .lp-check.done { background:${C.green}; border-color:${C.green}; }
        .lp-task { font-size:14px; font-weight:450; }
        .lp-task.done { text-decoration:line-through; color:${C.faint}; }
        .lp-meta { display:flex; gap:9px; margin-top:5px; font-size:11px; flex-wrap:wrap; }
        .lp-pill { display:inline-flex; align-items:center; gap:4px; }
        .lp-od { background:${C.accent}; color:#fff; font-weight:700; font-size:9.5px; padding:1px 7px; border-radius:50px; text-transform:uppercase; }

        .lp-section { padding:64px 0 8px; }
        .lp-h2 { font-family:'Instrument Serif',serif; font-size:clamp(2rem,4.5vw,2.8rem); text-align:center; letter-spacing:-0.02em; margin:0 0 8px; }
        .lp-h2 em { color:${C.accent}; font-style:italic; }
        .lp-lead { text-align:center; color:${C.sub}; max-width:480px; margin:0 auto 40px; }

        .lp-steps { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .lp-step { background:${C.bg2}; border:1px solid ${C.line}; border-radius:18px; padding:24px; }
        .lp-step-n { width:34px; height:34px; border-radius:10px; background:${C.accent}; color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; margin-bottom:14px; font-size:15px; }
        .lp-step h3 { font-size:17px; margin:0 0 7px; }
        .lp-step p { color:${C.sub}; font-size:14px; margin:0; }

        .lp-feats { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .lp-feat { background:${C.bg2}; border:1px solid ${C.line}; border-radius:18px; padding:24px; transition:transform .2s, border-color .2s; }
        .lp-feat:hover { transform:translateY(-4px); border-color:${C.accent}; }
        .lp-feat-i { font-size:26px; }
        .lp-feat h3 { font-size:15.5px; margin:12px 0 7px; }
        .lp-feat p { color:${C.sub}; font-size:13.5px; margin:0; }

        .lp-cta { text-align:center; background:${C.bg2}; border:1px solid ${C.line}; border-radius:24px; padding:54px 24px; margin:64px 0 0; }
        .lp-cta h2 { font-family:'Instrument Serif',serif; font-size:clamp(1.8rem,4vw,2.6rem); margin:0 0 12px; letter-spacing:-0.02em; }
        .lp-cta p { color:${C.sub}; margin:0 auto 26px; max-width:440px; }

        .lp-foot { text-align:center; color:${C.faint}; font-size:12.5px; padding:40px 0 50px; }
        .lp-foot a { color:${C.accent}; font-weight:600; }

        @media (max-width:720px) {
          .lp-steps { grid-template-columns:1fr; }
          .lp-feats { grid-template-columns:1fr; }
        }
      `}</style>

      <nav className="lp-nav">
        <span className="lp-logo">TaskMind</span>
        <a className="lp-btn" href="/app">Open app →</a>
      </nav>

      <header className="lp-hero">
        <div className="lp-wrap">
          <span className="lp-tag"><span className="lp-dot" /> AI Task Organizer · Free</span>
          <h1>Your to-do list,<br />but it actually <em>thinks.</em></h1>
          <p>Type a task the way you'd say it. TaskMind sorts it, schedules it, reminds you — and writes you a witty status of your day.</p>
          <div className="lp-actions">
            <a className="lp-btn" href="/app">Get started — it's free</a>
            <a className="lp-btn lp-btn-ghost" href="#how">See how it works</a>
          </div>

          <div className="lp-mock">
            <div className="lp-mock-head">
              <div className="lp-mock-h">Two things are overdue.<br /><span style={{ color: C.sub }}>Start with the login bug, hero.</span></div>
              <div className="lp-mock-sub">Saturday, June 28 · 1 of 4 done</div>
            </div>
            <div className="lp-row">
              <div className="lp-check" />
              <div>
                <div className="lp-task">Fix login bug on staging</div>
                <div className="lp-meta"><span className="lp-pill" style={{ color: C.green }}>● App Dev</span><span style={{ color: C.accent }}>High</span><span style={{ color: C.accent }}>Today · 5:00 PM</span><span className="lp-od">⚠ Overdue</span></div>
              </div>
            </div>
            <div className="lp-row">
              <div className="lp-check" />
              <div>
                <div className="lp-task">Write Q3 content calendar</div>
                <div className="lp-meta"><span className="lp-pill" style={{ color: C.purple }}>● Content</span><span style={{ color: C.accent }}>High</span><span style={{ color: C.sub }}>Today</span></div>
              </div>
            </div>
            <div className="lp-row">
              <div className="lp-check done" />
              <div>
                <div className="lp-task done">Book a dentist appointment</div>
                <div className="lp-meta"><span className="lp-pill" style={{ color: C.faint }}>● Personal</span></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="lp-section" id="how">
        <div className="lp-wrap">
          <h2 className="lp-h2">How it <em>works</em></h2>
          <p className="lp-lead">Four steps. No setup, no account, no learning curve.</p>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div className="lp-step" key={s.n}>
                <div className="lp-step-n">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">What makes it <em>different</em></h2>
          <p className="lp-lead">A task app that understands you — and talks back.</p>
          <div className="lp-feats">
            {FEATURES.map((f) => (
              <div className="lp-feat" key={f.t}>
                <div className="lp-feat-i">{f.i}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>

          <div className="lp-cta">
            <h2>Ready to clear your head?</h2>
            <p>Open TaskMind, type your first task, and watch it sort itself. No sign-up required.</p>
            <a className="lp-btn" href="/app">Open TaskMind →</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        TaskMind · made for the way you work · <a href="/app">Launch the app</a>
      </footer>
    </div>
  );
}
