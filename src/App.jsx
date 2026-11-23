import { useState, useRef, useEffect } from "react";
import "./App.css";
import { buildVideo } from "./buildVideo";
import { animateImage } from "./animate";

const STYLES = {
  Realistic: "photorealistic, cinematic lighting, natural colors, highly detailed, shot on a 35mm camera",
  Cartoon: "colorful 2D cartoon style, bold outlines, bright colors",
  Storybook: "soft watercolor children's storybook illustration",
  "3D": "cute 3D animated movie style, soft lighting",
};

const EXPORT_FORMATS = [
  { value: "mp4", label: "MP4 (H.264)" },
  { value: "webm", label: "WebM (VP9)" },
];

const EXPORT_RESOLUTIONS = [
  { value: "360p", label: "360p (640×360)" },
  { value: "720p", label: "720p (1280×720)" },
  { value: "1080p", label: "1080p (1920×1080)" },
];

const EXPORT_FRAMERATES = [
  { value: 12, label: "12 FPS" },
  { value: 24, label: "24 FPS" },
  { value: 30, label: "30 FPS" },
];

const EXAMPLE_PROMPTS = [
  "A curious fox discovers a glowing mushroom in an ancient forest",
  "A tiny robot learns to paint with watercolors",
  "A child's paper boat sails across the world in their imagination",
];

const MAX_IDEA = 500; // protects your free AI quota
const CONCURRENCY = 3; // parallel image/voice requests (free tiers rate-limit bursts)

/* ---------- small helpers ---------- */

async function runPool(tasks, limit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  });
  await Promise.all(workers);
}

async function postBlob(path, body, fallbackMsg) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || fallbackMsg);
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error(fallbackMsg);
      return blob;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500)); // one automatic retry
    }
  }
  throw lastErr;
}

function saveTextFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function revokeAll(...maps) {
  maps.forEach((m) =>
    Object.values(m).forEach((x) => x?.url && URL.revokeObjectURL(x.url))
  );
}

const settled = (m) =>
  Object.values(m).filter((x) => x.status === "done" || x.status === "error").length;

/* ---------- icons ---------- */

function Icon({ size = 18, className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}
const VideoIcon = (p) => (
  <Icon {...p}>
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </Icon>
);
const PlayIcon = (p) => (
  <Icon {...p}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </Icon>
);
const ImageIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </Icon>
);
const MicIcon = (p) => (
  <Icon {...p}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </Icon>
);
const DocIcon = (p) => (
  <Icon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Icon>
);
const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Icon>
);
const CloseIcon = (p) => (
  <Icon {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);
const MusicIcon = (p) => (
  <Icon {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Icon>
);
const AlertIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Icon>
);
const ChevronIcon = (p) => (
  <Icon {...p}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);
const CheckIcon = (p) => (
  <Icon {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

/* ---------- app ---------- */

export default function App() {
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("Realistic");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(""); // "", "script", "media"
  const [result, setResult] = useState(null);
  const [images, setImages] = useState({});
  const [voices, setVoices] = useState({});
  const [clips, setClips] = useState({});
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState("");
  const [video, setVideo] = useState(null);
  const [music, setMusic] = useState(null);
  const [hfToken, setHfToken] = useState("");
  const [animating, setAnimating] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("mp4");
  const [exportResolution, setExportResolution] = useState("720p");
  const [exportFramerate, setExportFramerate] = useState(30);

  const ideaRef = useRef(null);

  const setImg = (i, v) => setImages((p) => ({ ...p, [i]: v }));
  const setVoice = (i, v) => setVoices((p) => ({ ...p, [i]: v }));
  const setClip = (i, v) => setClips((p) => ({ ...p, [i]: v }));

  // Lock page scroll while an overlay/modal is open
  useEffect(() => {
    document.body.style.overflow = loading || showExportModal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [loading, showExportModal]);

  // Close export modal with Escape
  useEffect(() => {
    if (!showExportModal) return;
    const onKey = (e) => e.key === "Escape" && setShowExportModal(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExportModal]);

  async function makeImage(scene, i, character, styleText) {
    setImg(i, { status: "loading" });
    const prompt =
      `${styleText}. Main character (same in every scene): ${character}. Scene: ${scene.image_prompt}`.slice(0, 1500);
    try {
      const blob = await postBlob("/api/image", { prompt }, "Image failed");
      setImg(i, { status: "done", url: URL.createObjectURL(blob) });
    } catch (e) {
      setImg(i, { status: "error", message: e.message });
    }
  }

  async function makeVoice(scene, i) {
    setVoice(i, { status: "loading" });
    try {
      const blob = await postBlob("/api/voice", { text: scene.narration }, "Voice failed");
      setVoice(i, { status: "done", url: URL.createObjectURL(blob) });
    } catch (e) {
      setVoice(i, { status: "error", message: e.message });
    }
  }

  async function animateScene(i) {
    const scene = result.scenes[i];
    setAnimating(true);
    setClip(i, { status: "loading", message: "Starting..." });
    try {
      const url = await animateImage(
        images[i].url,
        `${scene.image_prompt}. Smooth, natural, subtle motion.`,
        hfToken.trim(),
        (m) => setClip(i, { status: "loading", message: m })
      );
      if (clips[i]?.url) URL.revokeObjectURL(clips[i].url);
      setClip(i, { status: "done", url });
    } catch (e) {
      setClip(i, { status: "error", message: e.message || "Animation failed." });
    }
    setAnimating(false);
  }

  async function generate() {
    const text = idea.trim();
    if (!text || loading) return;

    revokeAll(images, voices, clips);
    if (video) URL.revokeObjectURL(video.url);

    setLoading(true);
    setStage("script");
    setError("");
    setResult(null);
    setImages({});
    setVoices({});
    setClips({});
    setVideo(null);

    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not write the script. Try again.");
      if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
        throw new Error("The script came back empty. Try again with a different idea.");
      }
      setResult(data);
      setStage("media");

      const tasks = data.scenes.flatMap((s, i) => [
        () => makeImage(s, i, data.character, STYLES[style]),
        () => makeVoice(s, i),
      ]);
      await runPool(tasks, CONCURRENCY);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
    setStage("");
  }

  async function makeVideo() {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setError("");
    setBuilding(true);
    setProgress("Starting...");
    try {
      const scenes = result.scenes.map((s, i) => ({
        imageUrl: images[i].url,
        audioUrl: voices[i]?.status === "done" ? voices[i].url : null,
        text: s.narration,
        clipUrl: clips[i]?.status === "done" ? clips[i].url : null,
      }));
      setVideo(
        await buildVideo(scenes, setProgress, music, {
          format: exportFormat,
          resolution: exportResolution,
          framerate: exportFramerate,
        })
      );
    } catch (e) {
      setError(e.message);
    }
    setProgress("");
    setBuilding(false);
  }

  function resetVideo() {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
  }

  function useExample(prompt) {
    setIdea(prompt);
    ideaRef.current?.focus();
  }

  function onIdeaKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate();
  }

  const allReady =
    result &&
    !loading &&
    result.scenes.every(
      (_, i) =>
        images[i]?.status === "done" &&
        (voices[i]?.status === "done" || voices[i]?.status === "error")
    );
  const missingVoices = result
    ? result.scenes.filter((_, i) => voices[i]?.status === "error").length
    : 0;

  function downloadScript() {
    const lines = [`${result.title}`, `Character: ${result.character}`, ""];
    result.scenes.forEach((sc, i) => {
      lines.push(`Scene ${i + 1}`, `Narration: ${sc.narration}`, `Image prompt: ${sc.image_prompt}`, "");
    });
    saveTextFile(`${(result.title || "script").replace(/[^a-z0-9]+/gi, "-")}.txt`, lines.join("\n"));
  }

  const hasAnyScene = result && result.scenes.length > 0;

  // progress overlay numbers
  const total = result?.scenes.length ?? 0;
  const imgDone = settled(images);
  const voiceDone = settled(voices);
  const percent =
    stage === "script" || !total
      ? 8
      : Math.round(10 + (90 * (imgDone + voiceDone)) / (2 * total));
  const steps = [
    { key: "script", label: "Writing your script…", state: stage === "script" ? "active" : "done" },
    {
      key: "images",
      label: total ? `Painting scenes (${imgDone}/${total})…` : "Painting scenes…",
      state: stage === "script" ? "" : imgDone >= total ? "done" : "active",
    },
    {
      key: "voices",
      label: total ? `Recording voiceover (${voiceDone}/${total})…` : "Recording voiceover…",
      state: stage === "script" ? "" : voiceDone >= total ? "done" : "active",
    },
  ];

  return (
    <div className="app">
      <header className="header">
        <a href="/" className="logo" aria-label="AI Video Studio Home">
          <span className="logo-mark" aria-hidden="true">▶</span>
          AI Video Studio
        </a>
      </header>

      <main className="main">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero-title">
            Type an idea. Watch it become video.
          </h1>
          <p className="hero-subtitle">
            Describe any story, lesson, or scene. We'll write the script, paint the images,
            record a voiceover, and assemble the final video right in your browser.
          </p>

          <div className="input-card">
            <label htmlFor="idea-input" className="input-label">
              Your idea
            </label>
            <textarea
              id="idea-input"
              ref={ideaRef}
              className="idea-textarea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={onIdeaKeyDown}
              maxLength={MAX_IDEA}
              placeholder="Example: A curious fox discovers a glowing mushroom in an ancient forest"
              rows={4}
              aria-describedby="idea-hint"
            />
            <div id="idea-hint" className="sr-only">
              Type a story idea, up to {MAX_IDEA} characters. Press Ctrl+Enter to create the video.
            </div>

            <div className="input-row">
              <div className="style-select-wrapper">
                <label htmlFor="style-select" className="sr-only">
                  Visual style
                </label>
                <select
                  id="style-select"
                  className="style-select"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                >
                  {Object.keys(STYLES).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={generate}
                disabled={loading || !idea.trim()}
                aria-busy={loading}
              >
                <PlayIcon size={20} />
                {loading ? "Creating…" : "Create Video"}
              </button>
            </div>
          </div>

          <div className="capabilities" role="list" aria-label="What this creates">
            <div className="capability" role="listitem"><DocIcon size={20} className="capability-icon" />4–6 Scenes</div>
            <div className="capability" role="listitem"><ImageIcon size={20} className="capability-icon" />AI Images</div>
            <div className="capability" role="listitem"><MicIcon size={20} className="capability-icon" />Voiceover</div>
            <div className="capability" role="listitem"><VideoIcon size={20} className="capability-icon" />Final Video</div>
          </div>

          {!hasAnyScene && (
            <div className="showcase">
              <p className="showcase-label">Try an idea</p>
              <div className="showcase-grid">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="showcase-item"
                    onClick={() => useExample(prompt)}
                  >
                    <span className="showcase-placeholder">
                      <VideoIcon size={48} />
                      <span>{prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {loading && (
          <div className="progress-overlay" role="dialog" aria-modal="true" aria-labelledby="progress-title">
            <div className="progress-card">
              <h2 id="progress-title" className="progress-title">Creating your video</h2>
              <p className="progress-subtitle">This usually takes 30–60 seconds</p>
              <div className="progress-steps" role="status" aria-live="polite">
                {steps.map((step) => (
                  <div key={step.key} className={`progress-step ${step.state}`}>
                    <div className="progress-step-icon" aria-hidden="true">
                      {step.state === "done" ? (
                        <CheckIcon size={14} />
                      ) : (
                        <Icon size={14}><circle cx="12" cy="12" r="10" /></Icon>
                      )}
                    </div>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <AlertIcon size={20} className="error-icon" />
            <p className="error-message">{error}</p>
            <button className="error-dismiss" onClick={() => setError("")} aria-label="Dismiss error">
              <CloseIcon />
            </button>
          </div>
        )}

        {hasAnyScene && (
          <section className="result-section" aria-labelledby="result-title">
            <div className="result-header">
              <h2 id="result-title" className="result-title">{result.title}</h2>
              <div className="result-meta">
                <span className="result-character">{result.character}</span>
                <span>{result.scenes.length} scenes</span>
                <button type="button" className="btn btn-ghost btn-small" onClick={downloadScript}>
                  <DownloadIcon size={14} /> Script
                </button>
              </div>
            </div>

            <div className="scenes-wrapper">
              <p className="scenes-label">Scenes</p>
              <div className="scenes-track" role="list">
                {result.scenes.map((s, i) => {
                  const img = images[i];
                  const voice = voices[i];
                  const clip = clips[i];
                  const hasError = img?.status === "error" || voice?.status === "error";

                  let statusClass = "ready";
                  let statusText = "Static";
                  if (clip?.status === "loading") { statusClass = "generating"; statusText = "Animating…"; }
                  else if (clip?.status === "done") { statusText = "Animated"; }
                  else if (hasError) { statusClass = "error"; statusText = "Needs retry"; }
                  else if (img?.status === "loading" || voice?.status === "loading") { statusClass = "generating"; statusText = "Creating…"; }

                  return (
                    <article key={i} className="scene-card" role="listitem">
                      <div className="scene-media">
                        {clip?.status === "done" ? (
                          <video
                            className="clip"
                            src={clip.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            aria-label={`Scene ${i + 1} animated clip`}
                          />
                        ) : img?.status === "done" ? (
                          <img src={img.url} alt={`Scene ${i + 1}: ${s.narration}`} />
                        ) : (
                          <div className="showcase-placeholder">
                            <ImageIcon size={48} />
                          </div>
                        )}
                        {img?.status === "loading" && <div className="scene-loading" aria-hidden="true" />}
                      </div>
                      <div className="scene-content">
                        <div className="scene-header">
                          <span className="scene-number">Scene {i + 1}</span>
                          <span className={`scene-status ${statusClass}`}>{statusText}</span>
                        </div>
                        <p className="scene-narration">{s.narration}</p>
                        <div className="scene-actions">
                          {img?.status === "done" && !loading && (
                            <button
                              className="btn btn-secondary btn-small"
                              disabled={animating || clip?.status === "loading"}
                              onClick={() => animateScene(i)}
                              aria-busy={clip?.status === "loading"}
                            >
                              <VideoIcon size={16} />
                              {clip?.status === "done" ? "Re-animate" : "Animate"}
                            </button>
                          )}
                          {img?.status === "error" && (
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => makeImage(s, i, result.character, STYLES[style])}
                            >
                              Retry image
                            </button>
                          )}
                          {voice?.status === "error" && (
                            <button className="btn btn-secondary btn-small" onClick={() => makeVoice(s, i)}>
                              Retry voice
                            </button>
                          )}
                        </div>
                        {img?.status === "error" && <p className="error-message">{img.message}</p>}
                        {voice?.status === "error" && <p className="error-message">{voice.message}</p>}
                        <div className="scene-actions">
                          {img?.status === "done" && (
                            <a className="btn btn-ghost btn-small" href={img.url} download={`scene-${i + 1}.jpg`}>
                              <DownloadIcon size={14} /> Image
                            </a>
                          )}
                          {voice?.status === "done" && (
                            <a className="btn btn-ghost btn-small" href={voice.url} download={`scene-${i + 1}-voice.mp3`}>
                              <DownloadIcon size={14} /> Voice
                            </a>
                          )}
                          {clip?.status === "done" && (
                            <a className="btn btn-ghost btn-small" href={clip.url} download={`scene-${i + 1}-clip.mp4`}>
                              <DownloadIcon size={14} /> Clip
                            </a>
                          )}
                        </div>
                        {clip?.status === "loading" && <p className="progress-message">{clip.message}</p>}
                        {clip?.status === "error" && <p className="error-message">{clip.message}</p>}
                        {voice?.status === "done" && (
                          <audio className="scene-audio" controls src={voice.url} aria-label={`Scene ${i + 1} narration`} />
                        )}
                        {voice?.status === "loading" && <p className="progress-message">Recording voice…</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {allReady && (
              <section className="final-section" aria-labelledby="final-title">
                <div className="final-header">
                  <h2 id="final-title" className="final-title">Final Video</h2>
                </div>
                {missingVoices > 0 && !video && (
                  <p className="progress-message" role="status">
                    {missingVoices} scene{missingVoices > 1 ? "s have" : " has"} no voiceover yet. Use
                    "Retry voice" above, or make the video now and those scenes will be silent.
                  </p>
                )}

                {video ? (
                  <>
                    <div className="final-video-wrapper">
                      <video className="final-video" controls src={video.url} playsInline aria-label="Final assembled video" />
                    </div>
                    <div className="final-actions">
                      <a
                        className="btn btn-primary"
                        href={video.url}
                        download={`${(result.title || "video").replace(/[^a-z0-9]+/gi, "-")}.${video.ext}`}
                      >
                        <DownloadIcon /> Download Video
                      </a>
                      <button className="btn btn-secondary" onClick={resetVideo}>
                        Rebuild video
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
                        Export options
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="final-video-wrapper">
                      <div className="showcase-placeholder" style={{ background: "var(--ink)" }}>
                        <VideoIcon size={64} />
                        <span>Ready to assemble</span>
                      </div>
                    </div>
                    <div className="final-actions">
                      <div className="music-input">
                        <label className="music-label">
                          <input
                            type="file"
                            accept="audio/*"
                            className="sr-only"
                            onChange={(e) => setMusic(e.target.files[0] || null)}
                          />
                          <MusicIcon /> Add music (optional)
                        </label>
                        {music && (
                          <span className="music-selected">
                            <span>{music.name}</span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => setMusic(null)}
                              aria-label="Remove music"
                            >
                              <CloseIcon size={14} />
                            </button>
                          </span>
                        )}
                      </div>
                      <button className="btn btn-primary" onClick={makeVideo} disabled={building} aria-busy={building}>
                        <VideoIcon size={20} />
                        {building ? "Assembling…" : "Make Final Video"}
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
                        Export options
                      </button>
                    </div>
                    {progress && (
                      <p className="progress-message" style={{ marginTop: "var(--space-3)", textAlign: "center" }}>
                        {progress}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </section>
        )}

        <section className="token-section">
          <button
            type="button"
            className="token-toggle"
            onClick={() => setShowToken(!showToken)}
            aria-expanded={showToken}
            aria-controls="token-content"
          >
            <span>Optional: more free AI animation quota</span>
            <ChevronIcon className="token-chevron" />
          </button>
          {showToken && (
            <div className="token-content" id="token-content">
              <p className="token-description">
                AI animation uses a free public Hugging Face service with a small daily limit. A free
                Hugging Face account gives a bit more: create a <strong>Read</strong> token at{" "}
                <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">
                  huggingface.co/settings/tokens
                </a>{" "}
                and paste it here. It stays in this page only (it is gone when you close the tab) and is
                sent only to Hugging Face.
              </p>
              <div className="token-input-wrapper">
                <label htmlFor="hf-token" className="sr-only">Hugging Face token</label>
                <input
                  id="hf-token"
                  type="password"
                  autoComplete="off"
                  className="token-input"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder="hf_..."
                />
                <button className="btn btn-secondary" type="button" onClick={() => setShowToken(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {showExportModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowExportModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="export-modal-title" className="modal-title">Export options</h2>
              <button className="modal-close" onClick={() => setShowExportModal(false)} aria-label="Close export options">
                <CloseIcon size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label htmlFor="export-format" className="modal-label">Format</label>
                <select id="export-format" className="modal-select" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                  {EXPORT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label htmlFor="export-resolution" className="modal-label">Resolution</label>
                <select id="export-resolution" className="modal-select" value={exportResolution} onChange={(e) => setExportResolution(e.target.value)}>
                  {EXPORT_RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label htmlFor="export-framerate" className="modal-label">Frame rate</label>
                <select id="export-framerate" className="modal-select" value={exportFramerate} onChange={(e) => setExportFramerate(Number(e.target.value))}>
                  {EXPORT_FRAMERATES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <p className="modal-note">
                Changes apply the next time you click Make Final Video. Higher resolutions take longer,
                because the video is recorded in real time.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowExportModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>
          AI results can contain mistakes. Your ideas are sent to Cloudflare AI (and Google Gemini as a backup)
          to create the script, pictures and voice. If you use AI animation, your picture is sent to a public
          Hugging Face service. There are no accounts, and videos are made in your own browser.
        </p>
      </footer>
    </div>
  );
}
