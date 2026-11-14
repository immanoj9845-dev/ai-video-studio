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

// Script writers are tried in this order: Cloudflare's own models first
// (fast, nothing outside to overload), then Google Gemini as a backup.
// Cloudflare retires models now and then. If scripts start falling back to
// Gemini every time, run `npx wrangler ai models list` to see current names.
const WORKERS_AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.2-3b-instruct",
];
const GEMINI_MODELS = ["gemini-3.8-flash"];

function scriptPrompt(idea) {
  return `You are a video script writer for short videos.
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
}

function parseJson(text) {
  if (typeof text !== "string") return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (err) {
    return null;
  }
}

function validScript(s) {
  return (
    s &&
    Array.isArray(s.scenes) &&
    s.scenes.length > 0 &&
    s.scenes.every((x) => x && x.narration && x.image_prompt)
  );
}

async function callWorkersAI(prompt, env) {
  for (const model of WORKERS_AI_MODELS) {
    try {
      const r = await env.AI.run(model, {
        messages: [
          { role: "system", content: "You write short video scripts. Reply with JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
      });
      const out = r?.response ?? r?.choices?.[0]?.message?.content;
      const script = out && typeof out === "object" ? out : parseJson(out);
      if (validScript(script)) return script;
    } catch (e) {
      // try the next model
    }
  }
  return null;
}

async function callGemini(prompt, env) {
  let last = { status: 502, error: "AI service error." };
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
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
        error: data.error?.message || `AI service error (status ${res.status})`,
      };
      if (![429, 500, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 800));
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
    const prompt = scriptPrompt(idea);

    let script = await callWorkersAI(prompt, env);
    let failure = null;

    if (!script) {
      const out = await callGemini(prompt, env);
      if (out.ok) {
        script = parseJson(out.data.candidates?.[0]?.content?.parts?.[0]?.text);
      } else {
        failure = out;
      }
    }

    if (!validScript(script)) {
      const busy = failure && [429, 500, 503].includes(failure.status);
      return json(
        {
          error: busy
            ? "The AI is very busy right now. Please wait a minute and try again."
            : "Could not write the script. Please try again.",
        },
        502
      );
    }
    return json(script);
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