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

// Blurred, darkened copy of the picture to fill the wide 16:9 frame
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

// p goes from 0 to 1 during the scene: a slow zoom-in
function drawFrame(ctx, item, p) {
  ctx.drawImage(item.bg, 0, 0);
  const size = H * (1 + 0.08 * p);
  ctx.drawImage(item.img, (W - size) / 2, (H - size) / 2, size, size);
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

export async function buildVideo(scenes, onProgress) {
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
    items.push({ img, buf, bg: makeBackground(img) });
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

  for (let i = 0; i < items.length; i++) {
    onProgress(`Recording scene ${i + 1} of ${items.length}... keep this tab open`);
    const item = items[i];
    const src = audioCtx.createBufferSource();
    src.buffer = item.buf;
    src.connect(dest);
    src.start();
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
  }

  recorder.stop();
  await stopped;
  audioCtx.close();

  const type = mime.split(";")[0];
  return {
    url: URL.createObjectURL(new Blob(chunks, { type })),
    ext: type.includes("mp4") ? "mp4" : "webm",
  };
}