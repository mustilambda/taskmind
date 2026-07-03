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
      const corrections = Array.isArray(body.corrections) ? body.corrections.slice(0, 12) : [];
      const correctionsNote = corrections.length
        ? " The user previously corrected the AI's sorting on these tasks — their final choice is the ground truth. " +
          "Match similar future tasks the same way (same category/priority) rather than re-guessing: " +
          corrections.map((c) => `"${String(c.title || "").slice(0, 60)}" → ${c.category || "?"} / ${c.priority || "?"}`).join("; ") + "."
        : "";
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
              : "") +
            correctionsNote,
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
      const profile = String(body.context || "").slice(0, 600);
      const name = String(body.name || "").slice(0, 40).trim();
      if (!list.length) {
        res.status(400).json({ error: "No tasks" });
        return;
      }
      const open = list.filter((t) => !t.done);
      const done = list.filter((t) => t.done);
      const overdue = open.filter((t) => t.overdue);
      const high = open.filter((t) => t.priority === "High");
      // most urgent open task: overdue first, then High priority, then first open
      const top = overdue[0] || high[0] || open[0];
      const topTask = top ? top.title : "";

      const out = await groqJSON([
        {
          role: "system",
          content:
            "You are TaskMind's witty AI narrator. Write a single punchy headline (1–2 sentences max) for the user's dashboard based on their current task situation.\n\n" +
            `User's name: ${name || "(unknown)"}\n` +
            `User's work context: ${profile || "(none given)"}\n` +
            `Pending tasks: ${open.length}\n` +
            `Overdue tasks: ${overdue.length}\n` +
            `Completed today: ${done.length}\n` +
            `Most urgent task: ${topTask || "(none)"}\n\n` +
            "Rules:\n" +
            "- If total pending tasks > 5: roast them. Be savage but lovable. Reference their actual work context and top task by name.\n" +
            "- If total pending tasks is 3–5: be motivating with a hint of sarcasm. Acknowledge what's done, nudge what's left.\n" +
            "- If total pending tasks is 1–2: be light, funny, and encouraging. They're almost there.\n" +
            "- If total pending tasks is 0: celebrate wildly. Make them feel like a legend.\n" +
            "- If overdue > 0: always mention the overdue count somewhere, no matter the total. Guilt them gently.\n" +
            "- If a name is provided, use it at least once.\n" +
            "- Never be generic. Always reference either the user's work context or their top task by name.\n" +
            "- No hashtags. At most one emoji, only if it lands.\n" +
            'Return ONLY JSON: {"line1": a punchy hook (max ~8 words), "line2": the witty nudge (max ~18 words)}.',
        },
        { role: "user", content: "Write my dashboard headline." },
      ], 0.9);
      res.status(200).json({
        line1: String(out.line1 || "").slice(0, 100),
        line2: String(out.line2 || "").slice(0, 180),
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
