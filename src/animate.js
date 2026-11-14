import { Client, handle_file } from "@gradio/client";

const SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster";
const ENDPOINT = "/generate_video";

function friendly(msg) {
  const m = String(msg || "");
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
    const client = await Client.connect(SPACE, token ? { hf_token: token, token } : {});
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
    let data = null;
    for await (const msg of client.submit(ENDPOINT, payload)) {
      if (msg.type === "status") {
        if (msg.stage === "error") throw new Error(msg.message || "AI video failed.");
        if (msg.queue && typeof msg.position === "number") {
          onStatus(`Waiting in the queue (position ${msg.position + 1})...`);
        } else if (msg.stage === "generating") {
          onStatus("Generating the clip...");
        }
      }
      if (msg.type === "data") data = msg.data;
    }

    const url = findUrl(data);
    if (!url) throw new Error("The AI video service did not return a clip.");
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not download the clip.");
    return URL.createObjectURL(await res.blob());
  } catch (e) {
    throw new Error(friendly(e?.message || String(e)));
  }
}