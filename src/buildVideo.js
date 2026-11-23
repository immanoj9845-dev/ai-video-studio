const EXPORT_RESOLUTIONS = {
  "360p": { width: 640, height: 360 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

const EXPORT_FRAMERATES = [12, 24, 30];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A scene image failed to load."));
    img.src = url;
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("clip failed to load"));
    v.src = url;
  });
}

const MIME_OPTIONS = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

// Prefer the format the user picked, but fall back to anything the browser can record
// (Firefox/Safari can't always record MP4, so this avoids a misleading error).
function pickMime(format) {
  const supported = (m) => MediaRecorder.isTypeSupported(m);
  const preferred = format ? MIME_OPTIONS.filter((m) => m.startsWith(`video/${format}`)) : [];
  return preferred.find(supported) || MIME_OPTIONS.find(supported) || "";
}

export async function buildVideo(scenes, onProgress, musicFile, options = {}) {
  const resolution = EXPORT_RESOLUTIONS[options.resolution] ? options.resolution : "720p";
  const { width: W, height: H } = EXPORT_RESOLUTIONS[resolution];
  const FPS = EXPORT_FRAMERATES.includes(options.framerate) ? options.framerate : 30;
  const scale = W / 1280; // keep caption/pan sizes proportional at every resolution

  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("This browser can't record video. Please use Chrome on a computer.");
  }
  const mime = pickMime(options.format);
  if (!mime) {
    throw new Error("This browser can't record video. Please use Chrome on a computer.");
  }

  // blurred, darkened, cover-fit copy of the image used behind the sharp picture
  function makeBackground(img) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.1;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    g.filter = "blur(30px)";
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    g.filter = "none";
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, 0, W, H);
    return c;
  }

  function drawCaption(ctx, text) {
    if (!text) return;
    const fontSize = Math.floor(H / 22);
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const side = 60 * scale;
    const maxWidth = W - side * 2 - 40 * scale;
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const lineH = fontSize * 1.35;
    const pad = 12 * scale;
    const boxH = lines.length * lineH + pad * 2;
    const boxY = H - boxH - H / 24;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(side, boxY, W - side * 2, boxH);
    ctx.fillStyle = "#ffffff";
    lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + pad + lineH * (i + 0.5)));
  }

  // draw `src` fitted inside the canvas (whole picture visible), times `zoom`
  function drawContain(ctx, src, sw, sh, zoom = 1, panX = 0) {
    const s = Math.min(W / sw, H / sh) * zoom;
    const w = sw * s;
    const h = sh * s;
    ctx.drawImage(src, (W - w) / 2 + panX, (H - h) / 2, w, h);
  }

  function drawFrame(ctx, item, p) {
    ctx.drawImage(item.bg, 0, 0);
    const v = item.video;
    if (v && v.videoWidth) {
      drawContain(ctx, v, v.videoWidth, v.videoHeight);
    } else {
      const m = item.motion;
      const zoomT = m % 2 === 0 ? p : 1 - p;
      const pan = m === 2 ? -40 * scale * (p - 0.5) : m === 3 ? 40 * scale * (p - 0.5) : 0;
      drawContain(ctx, item.img, item.img.naturalWidth, item.img.naturalHeight, 1 + 0.08 * zoomT, pan);
    }
    drawCaption(ctx, item.text);
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const audioCtx = new AudioContext();
  let recorder = null;
  let stream = null;
  let music = null;

  try {
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();

    onProgress("Loading scenes...");
    const items = [];
    for (const s of scenes) {
      const img = await loadImage(s.imageUrl);
      // a scene without voiceover stays silent for a time based on its text
      let buf = null;
      if (s.audioUrl) {
        const arr = await (await fetch(s.audioUrl)).arrayBuffer();
        buf = await audioCtx.decodeAudioData(arr);
      }
      const silentDur = Math.max(3, (s.text || "").split(/\s+/).length * 0.4);
      const video = s.clipUrl ? await loadVideo(s.clipUrl).catch(() => null) : null;
      items.push({ img, buf, silentDur, video, bg: makeBackground(img), text: s.text, motion: items.length % 4 });
    }

    if (musicFile) {
      try {
        const mbuf = await audioCtx.decodeAudioData(await musicFile.arrayBuffer());
        music = audioCtx.createBufferSource();
        music.buffer = mbuf;
        music.loop = true;
        const gain = audioCtx.createGain();
        gain.gain.value = 0.15;
        music.connect(gain);
        gain.connect(dest);
      } catch {
        music = null;
        throw new Error("Could not read that music file. Try an MP3 or WAV.");
      }
    }

    drawFrame(ctx, items[0], 0);
    stream = new MediaStream([
      ...canvas.captureStream(FPS).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: resolution === "1080p" ? 8000000 : resolution === "720p" ? 4000000 : 2000000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start(1000);
    if (music) music.start();

    for (let i = 0; i < items.length; i++) {
      onProgress(`Recording scene ${i + 1} of ${items.length}... keep this tab open and visible`);
      const item = items[i];
      if (item.buf) {
        const src = audioCtx.createBufferSource();
        src.buffer = item.buf;
        src.connect(dest);
        src.start();
      }
      if (item.video) {
        item.video.currentTime = 0;
        await item.video.play().catch(() => {});
      }
      const dur = (item.buf ? item.buf.duration : item.silentDur) + 0.6;
      const t0 = performance.now();
      await new Promise((resolve) => {
        function frame(now) {
          const t = (now - t0) / 1000;
          if (t >= dur) return resolve();
          drawFrame(ctx, item, Math.max(0, t) / dur);
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      if (item.video) item.video.pause();
    }

    if (music) music.stop();
    await new Promise((r) => setTimeout(r, 250)); // let the last frame flush
    recorder.stop();
    await stopped;

    const type = mime.split(";")[0];
    return {
      url: URL.createObjectURL(new Blob(chunks, { type })),
      ext: type.includes("mp4") ? "mp4" : "webm",
    };
  } finally {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
  }
}
