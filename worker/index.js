export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/script") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleScript(request, env);
    }
    if (url.pathname === "/api/image") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleImage(request, env);
    }
    if (url.pathname === "/api/voice") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleVoice(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

// Models are tried in order. To add a backup, copy another model name
// from Google AI Studio's model list and add it to this list.
const GEMINI_MODELS = ["gemini-3.8-flash"];

async function callGemini(prompt, env) {
  let last = { status: 502, error: "AI service error." };
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
           const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (e) {}
      if (res.ok) return { ok: true, data };
      last = {
        status: res.status,
        error:
          data.error?.message ||
          `AI service error (status ${res.status}): ${raw.slice(0, 200)}`,
      };
      if (![429, 500, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return { ok: false, ...last };
}

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

    const out = await callGemini(prompt, env);
    if (!out.ok) {
      const busy = [429, 500, 503].includes(out.status);
      return json(
        {
          error: busy
            ? "The AI is very busy right now. Please wait a minute and try again."
            : out.error,
        },
        502
      );
    }

    const text = out.data.candidates?.[0]?.content?.parts?.[0]?.text;
    return json(JSON.parse(text));
  } catch (e) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function handleImage(request, env) {
  try {
    const { prompt } = await request.json();
    if (!prompt || prompt.length > 1500) {
      return json({ error: "Invalid prompt." }, 400);
    }
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt,
      steps: 4,
    });
    const bytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": "image/png" } });
  } catch (e) {
    return json(
      { error: "Image service is busy or today's free limit was reached. Try again later." },
      503
    );
  }
}

async function handleVoice(request, env) {
  try {
    const { text } = await request.json();
    if (!text || text.length > 600) {
      return json({ error: "Invalid text." }, 400);
    }
    const result = await env.AI.run("@cf/myshell-ai/melotts", {
      prompt: text,
      lang: "en",
    });
    const audio = typeof result === "string" ? result : result.audio;
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e) {
    return json(
      { error: "Voice service is busy or today's free limit was reached. Try again later." },
      503
    );
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}