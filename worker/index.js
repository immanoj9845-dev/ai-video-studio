export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/script") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleScript(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleScript(request, env) {
  try {
    const { idea } = await request.json();
    if (!idea || idea.length > 500) {
      return json({ error: "Please enter an idea (max 500 characters)." }, 400);
    }

    const prompt = `You are a video script writer for short videos.
Write a script for this idea: "${idea}"
Return ONLY JSON in this exact shape:
{
  "title": "short title",
  "character": "one-sentence visual description of the main character (appearance, clothes, style)",
  "scenes": [
    { "narration": "what the voice says (1-2 sentences)", "image_prompt": "visual description of the scene" }
  ]
}
Use 4 to 6 scenes. Keep the language simple and friendly.`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return json({ error: data.error?.message || "AI service error." }, 502);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return json(JSON.parse(text));
  } catch (e) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}