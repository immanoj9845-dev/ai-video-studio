const W = 1280;
const H = 720;
const FPS = 30;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
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

function makeBackground(img) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.filter = "blur(30px)";
  g.drawImage(img, -40, -(W - H) / 2 - 40, W + 80, W + 80);
  g.filter = "none";
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(0, 0, W, H);
  return c;
}

function drawCaption(ctx, text) {
  if (!text) return;
  const fontSize = 32;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = W - 160;
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
  const boxH = lines.length * lineH + 24;
  const boxY = H - boxH - 30;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(60, boxY, W - 120, boxH);
  ctx.fillStyle = "#ffffff";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + 12 + lineH * (i + 0.5)));
}

function drawFrame(ctx, item, p) {
  ctx.drawImage(item.bg, 0, 0);
  const v = item.video;
  if (v && v.videoWidth) {
    const s = Math.min(W / v.videoWidth, H / v.videoHeight);
    const w = v.videoWidth * s;
    const h = v.videoHeight * s;
    ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const m = item.motion;
    const zoom = m % 2 === 0 ? p : 1 - p;
    const size = H * (1 + 0.08 * zoom);
    const pan = m === 2 ? -40 * (p - 0.5) : m === 3 ? 40 * (p - 0.5) : 0;
    ctx.drawImage(item.img, (W - size) / 2 + pan, (H - size) / 2, size, size);
  }
  drawCaption(ctx, item.text);
}

function pickMime() {
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

export async function buildVideo(scenes, onProgress, musicFile) {
  const mime = pickMime();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("This browser can't record video. Please use Chrome on a computer.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();

  onProgress("Loading scenes...");
  const items = [];
  for (const s of scenes) {
    const img = await loadImage(s.imageUrl);
    const arr = await (await fetch(s.audioUrl)).arrayBuffer();
    const buf = await audioCtx.decodeAudioData(arr);
    const video = s.clipUrl ? await loadVideo(s.clipUrl).catch(() => null) : null;
    items.push({
      img,
      buf,
      video,
      bg: makeBackground(img),
      text: s.text,
      motion: items.length % 4,
    });
  }

  let music = null;
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
    } catch (e) {
      throw new Error("Could not read that music file. Try an MP3 or WAV.");
    }
  }

  drawFrame(ctx, items[0], 0);
  const stream = new MediaStream([
    ...canvas.captureStream(FPS).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 4000000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start(1000);
  if (music) music.start();

  for (let i = 0; i < items.length; i++) {
    onProgress(`Recording scene ${i + 1} of ${items.length}... keep this tab open`);
    const item = items[i];
    const src = audioCtx.createBufferSource();
    src.buffer = item.buf;
    src.connect(dest);
    src.start();
    if (item.video) {
      item.video.currentTime = 0;
      await item.video.play().catch(() => {});
    }
    const dur = item.buf.duration + 0.6;
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
  recorder.stop();
  await stopped;
  audioCtx.close();

  const type = mime.split(";")[0];
  return {
    url: URL.createObjectURL(new Blob(chunks, { type })),
    ext: type.includes("mp4") ? "mp4" : "webm",
  };
}