const ALLOWED_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);

      // Basic abuse guard: only accept calls made from this site (or local dev).
      // It is not bullet-proof (scripts can fake headers), so also add a
      // Cloudflare rate-limiting rule for /api/* in the dashboard.
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin && !ALLOWED_DEV_ORIGINS.includes(origin)) {
        return json({ error: "Not allowed." }, 403);
      }

      if (url.pathname === "/api/script") return handleScript(request, env);
      if (url.pathname === "/api/image") return handleImage(request, env);
      if (url.pathname === "/api/voice") return handleVoice(request, env);
      return json({ error: "Not found." }, 404);
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

const MAX_SCENES = 6; // every scene costs one image + one voice call from your free quota
const MAX_NARRATION = 500; // /api/voice rejects text over 600 characters

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
  } catch {
    return null;
  }
}

// Returns a clean script object (limited size, all fields present) or null.
function normalizeScript(s) {
  if (!s || !Array.isArray(s.scenes)) return null;
  const scenes = s.scenes
    .filter((x) => x && typeof x.narration === "string" && typeof x.image_prompt === "string")
    .filter((x) => x.narration.trim() && x.image_prompt.trim())
    .slice(0, MAX_SCENES)
    .map((x) => ({
      narration: x.narration.trim().slice(0, MAX_NARRATION),
      image_prompt: x.image_prompt.trim(),
    }));
  if (scenes.length === 0) return null;
  return {
    title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Untitled video",
    character: typeof s.character === "string" ? s.character.trim() : "",
    scenes,
  };
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
      const script = normalizeScript(out && typeof out === "object" ? out : parseJson(out));
      if (script) return script;
    } catch (e) {
      console.error("Workers AI script error", model, e?.message || e);
      // try the next model
    }
  }
  return null;
}

async function callGemini(prompt, env) {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, status: 500, error: "Backup AI is not configured." };
  }
  let last = { status: 502, error: "AI service error." };
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(
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
      } catch (e) {
        last = { status: 502, error: "Could not reach the backup AI." };
        continue;
      }
      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}
      if (res.ok) return { ok: true, data };
      last = {
        status: res.status,
        error: data.error?.message || `AI service error (status ${res.status})`,
      };
      console.error("Gemini error", model, last.status, last.error);
      if (![429, 500, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { ok: false, ...last };
}

async function handleScript(request, env) {
  try {
    const body = await request.json();
    const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
    if (!idea || idea.length > 500) {
      return json({ error: "Please enter an idea (max 500 characters)." }, 400);
    }
    const prompt = scriptPrompt(idea);

    let script = await callWorkersAI(prompt, env);
    let failure = null;

    if (!script) {
      const out = await callGemini(prompt, env);
      if (out.ok) {
        script = normalizeScript(
          parseJson(out.data.candidates?.[0]?.content?.parts?.[0]?.text)
        );
      } else {
        failure = out;
      }
    }

    if (!script) {
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
    console.error("handleScript", e?.message || e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function handleImage(request, env) {
  try {
    const { prompt } = await request.json();
    if (typeof prompt !== "string" || !prompt || prompt.length > 1500) {
      return json({ error: "Invalid prompt." }, 400);
    }
    const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt,
      steps: 4,
    });
    // Flux returns a base64 JPEG
    return new Response(base64ToBytes(result.image), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("handleImage", e?.message || e);
    return json(
      { error: "Image service is busy or today's free limit was reached. Try again later." },
      503
    );
  }
}

function audioResponse(result) {
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" };
  if (result instanceof ReadableStream) return new Response(result, { headers });
  if (result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
    return new Response(result, { headers });
  }
  let audio = typeof result === "string" ? result : result?.audio;
  if (typeof audio !== "string" || !audio) {
    throw new Error("Unexpected voice response: " + JSON.stringify(Object.keys(result || {})));
  }
  audio = audio.replace(/^data:[^,]*;base64,/, "");
  return new Response(base64ToBytes(audio), { headers });
}

async function handleVoice(request, env) {
  try {
    const { text } = await request.json();
    const clean = typeof text === "string" ? text.trim() : "";
    if (!clean || clean.length > 600) {
      return json({ error: "Invalid text." }, 400);
    }
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await env.AI.run("@cf/myshell-ai/melotts", { prompt: clean, lang: "en" });
        break;
      } catch (e) {
        if (attempt === 1) throw e;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    return audioResponse(result);
  } catch (e) {
    console.error("handleVoice", e?.message || e);
    return json(
      { error: "Voice service is busy or today's free limit was reached. Try again later." },
      503
    );
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
