// Vercel serverless function — TaskMind AI backend.
// The Groq API key stays server-side (process.env.GROQ_API_KEY); it is never
// exposed to the browser. Anyone using the deployed URL shares this one key.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function groqJSON(messages, temperature = 0.3) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Groq ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return JSON.parse(data.choices[0].message.content);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { action } = body;

    if (action === "classify") {
      const text = String(body.text || "").slice(0, 400);
      const context = String(body.context || "").slice(0, 800);
      if (!text.trim()) {
        res.status(400).json({ error: "Missing text" });
        return;
      }
      const out = await groqJSON([
        {
          role: "system",
          content:
            "You are TaskMind, a personal task organizer. Given a task the user just wrote, decide how to file it. " +
            "Invent a short, natural category (1-2 words, Title Case) that fits the user's life — do NOT restrict to a fixed list. " +
            "Reuse the user's existing categories when one fits. " +
            'Respond with ONLY JSON: {"category": string, "priority": "High"|"Medium"|"Low", ' +
            '"dateLabel": short human due hint like "Today"/"Tomorrow"/"This weekend"/"No date", ' +
            '"overdue": boolean, "reason": one short sentence (max ~12 words) explaining the call}.' +
            (context ? ` User context: ${context}` : "") +
            (Array.isArray(body.existingCategories) && body.existingCategories.length
              ? ` Existing categories: ${body.existingCategories.join(", ")}.`
              : ""),
        },
        { role: "user", content: text },
      ]);
      res.status(200).json({
        category: String(out.category || "General").slice(0, 24),
        priority: ["High", "Medium", "Low"].includes(out.priority) ? out.priority : "Medium",
        dateLabel: String(out.dateLabel || "No date").slice(0, 24),
        overdue: !!out.overdue,
        reason: String(out.reason || "").slice(0, 140),
      });
      return;
    }

    if (action === "summary") {
      const list = Array.isArray(body.tasks) ? body.tasks.slice(0, 30) : [];
      const context = String(body.context || "").slice(0, 600);
      if (!list.length) {
        res.status(400).json({ error: "No tasks" });
        return;
      }
      const open = list.filter((t) => !t.done);
      const done = list.filter((t) => t.done);
      const overdue = open.filter((t) => t.overdue);
      const high = open.filter((t) => t.priority === "High");
      const lines = list
        .map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.overdue ? " (OVERDUE)" : ""}${t.priority === "High" ? " (HIGH)" : ""}`)
        .join("\n");
      const out = await groqJSON([
        {
          role: "system",
          content:
            "You are TaskMind's home-screen voice: a witty, encouraging friend who hypes the user up. " +
            "Given their task list, write a status that is BOTH genuinely funny AND motivating. " +
            "Celebrate what's done, playfully roast what's pending or overdue, and end on a push to act. " +
            "Keep it punchy and human — no corporate tone, no hashtags. At most ONE emoji total, only if it lands. " +
            'Return ONLY JSON: {"line1": a punchy hook (max ~8 words), "line2": a funny/encouraging nudge (max ~14 words)}.' +
            (context ? ` About the user: ${context}` : ""),
        },
        {
          role: "user",
          content:
            `Done: ${done.length}, Open: ${open.length}, Overdue: ${overdue.length}, High-priority: ${high.length}.\n` +
            `Tasks:\n${lines}`,
        },
      ], 0.85);
      res.status(200).json({
        line1: String(out.line1 || "").slice(0, 90),
        line2: String(out.line2 || "").slice(0, 140),
      });
      return;
    }

    if (action === "profile") {
      const about = String(body.about || "").slice(0, 600);
      if (!about.trim()) {
        res.status(400).json({ error: "Missing about" });
        return;
      }
      const out = await groqJSON([
        {
          role: "system",
          content:
            "You are TaskMind. Turn the user's rough notes about themselves into a concise profile (3-5 sentences) " +
            "that the app can use as context when sorting their tasks. Also list the kinds of work they juggle. " +
            'Respond with ONLY JSON: {"text": the profile paragraph, "cats": array of 2-5 short focus-area labels (Title Case)}.',
        },
        { role: "user", content: about },
      ]);
      res.status(200).json({
        text: String(out.text || "").slice(0, 800),
        cats: (Array.isArray(out.cats) ? out.cats : []).slice(0, 5).map((s) => String(s).slice(0, 24)),
      });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
