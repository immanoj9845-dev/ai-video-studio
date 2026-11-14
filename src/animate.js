import { Client, handle_file } from "@gradio/client";

const SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster";
const SPACE_URL = "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space";
const ENDPOINT = "/generate_video";

async function connect(token) {
  const opts = token ? { hf_token: token, token } : {};
  try {
    return await Client.connect(SPACE_URL, opts);
  } catch (e) {
    return await Client.connect(SPACE, opts);
  }
}

function friendly(msg) {
  const m = String(msg || "");
  if (/metadata|failed to fetch|network/i.test(m)) {
    return "Could not reach the free AI video service (Hugging Face). Check your internet connection and any ad blocker, then try again.";
  }
  if (/quota|gpu/i.test(m)) {
    return "The free AI video quota is used up. Try again later (it resets daily), or add a free Hugging Face token below for a bit more.";
  }
  return m || "AI video failed. Try again later.";
}

function findUrl(x) {
  if (!x) return null;
  if (typeof x === "string") return /^https?:/.test(x) ? x : null;
  if (Array.isArray(x)) {
    for (const i of x) {
      const u = findUrl(i);
      if (u) return u;
    }
    return null;
  }
  if (typeof x === "object") {
    if (typeof x.url === "string") return x.url;
    if (typeof x.path === "string" && /\.(mp4|webm|mov)$/i.test(x.path)) {
      return `${SPACE_URL}/gradio_api/file=${x.path}`;
    }
    for (const k of Object.keys(x)) {
      const u = findUrl(x[k]);
      if (u) return u;
    }
  }
  return null;
}

export async function animateImage(imageUrl, prompt, token, onStatus) {
  try {
    onStatus("Connecting to the free AI video service...");
    const client = await connect(token);
    const api = await client.view_api();
    const ep = api.named_endpoints?.[ENDPOINT];
    if (!ep) {
      throw new Error("The free AI video service has changed and can't be used right now.");
    }

    const blob = await (await fetch(imageUrl)).blob();
    const payload = {};
    let imageDone = false;
    let promptDone = false;
    for (const p of ep.parameters) {
      const comp = String(p.component || "").toLowerCase();
      if (!imageDone && comp.includes("image")) {
        payload[p.parameter_name] = handle_file(blob);
        imageDone = true;
      } else if (!promptDone && comp.includes("textbox")) {
        payload[p.parameter_name] = prompt;
        promptDone = true;
      } else if (p.parameter_has_default) {
        payload[p.parameter_name] = p.parameter_default;
      }
    }
    if (!imageDone) {
      throw new Error("The free AI video service no longer accepts a picture.");
    }

    onStatus("Animating... this can take a few minutes");
    let found = null;
    const seen = [];
    for await (const msg of client.submit(ENDPOINT, payload)) {
      if (msg.type === "status") {
        if (msg.stage === "error") throw new Error(msg.message || "AI video failed.");
        if (msg.queue && typeof msg.position === "number") {
          onStatus(`Waiting in the queue (position ${msg.position + 1})...`);
        } else if (msg.stage === "generating") {
          onStatus("Generating the clip...");
        }
      }
      if (msg.type === "data" || msg.type === "update") {
        seen.push(msg.data);
        found = findUrl(msg.data) || found;
      }
    }
    console.log("AI video reply:", seen);

    if (!found) {
      const err = new Error(
        "The AI video service did not return a clip. Details: " +
          JSON.stringify(seen).slice(0, 400)
      );
      err.keep = true;
      throw err;
    }
    const res = await fetch(found);
    if (!res.ok) throw new Error("Could not download the clip.");
    return URL.createObjectURL(await res.blob());
  } catch (e) {
    if (e && e.keep) throw e;
    throw new Error(friendly(e?.message || String(e)));
  }
}