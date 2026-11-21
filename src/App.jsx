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

const EXAMPLE_PROMPTS = [
  "A curious fox discovers a glowing mushroom in an ancient forest",
  "A tiny robot learns to paint with watercolors",
  "A child's paper boat sails across the world in their imagination",
];

export default function App() {
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("Realistic");
  const [loading, setLoading] = useState(false);
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
  const [progressStep, setProgressStep] = useState(0);
  const [progressSteps] = useState([
    { key: "script", label: "Writing your script…" },
    { key: "images", label: "Painting scenes…" },
    { key: "voices", label: "Recording voiceover…" },
    { key: "animation", label: "Animating scenes…" },
  ]);

  const progressOverlayRef = useRef(null);
  const progressStepsRef = useRef(null);

  const setImg = (i, v) => setImages((p) => ({ ...p, [i]: v }));
  const setVoice = (i, v) => setVoices((p) => ({ ...p, [i]: v }));
  const setClip = (i, v) => setClips((p) => ({ ...p, [i]: v }));

  async function makeImage(scene, i, character, styleText) {
    setImg(i, { status: "loading" });
    const prompt =
      `${styleText}. Main character (same in every scene): ${character}. Scene: ${scene.image_prompt}`.slice(0, 1500);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Image failed");
      }
      const blob = await res.blob();
      setImg(i, { status: "done", url: URL.createObjectURL(blob) });
    } catch (e) {
      setImg(i, { status: "error", message: e.message });
    }
  }

  async function makeVoice(scene, i) {
    setVoice(i, { status: "loading" });
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scene.narration }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Voice failed");
      }
      const blob = await res.blob();
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
      setClip(i, { status: "done", url });
    } catch (e) {
      setClip(i, { status: "error", message: e.message || "Animation failed." });
    }
    setAnimating(false);
  }

  async function generate() {
    setLoading(true);
    setError("");
    setResult(null);
    setImages({});
    setVoices({});
    setClips({});
    setVideo(null);
    setProgressStep(0);

    // Show progress overlay
    progressOverlayRef.current?.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);

      setProgressStep(1);
      await Promise.all(
        data.scenes.map((s, i) =>
          Promise.all([makeImage(s, i, data.character, STYLES[style]), makeVoice(s, i)])
        )
      );
      setProgressStep(4);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
    progressOverlayRef.current?.classList.add("hidden");
    document.body.style.overflow = "";
  }

  async function makeVideo() {
    setVideo(null);
    setError("");
    setBuilding(true);
    setProgress("Starting...");
    try {
      const scenes = result.scenes.map((_, i) => ({
        imageUrl: images[i].url,
        audioUrl: voices[i].url,
        text: result.scenes[i].narration,
        clipUrl: clips[i]?.status === "done" ? clips[i].url : null,
      }));
      setVideo(await buildVideo(scenes, setProgress, music));
    } catch (e) {
      setError(e.message);
    }
    setProgress("");
    setBuilding(false);
  }

  function fillExample(prompt) {
    setIdea(prompt);
  }

  const allReady =
    result &&
    !loading &&
    result.scenes.every(
      (_, i) => images[i]?.status === "done" && voices[i]?.status === "done"
    );

  const hasAnyScene = result && result.scenes.length > 0;

  return (
    <div className="app">
      <header className="header">
        <a href="/" className="logo" aria-label="AI Video Studio Home">
          <span className="logo-mark" aria-hidden="true">▶</span>
          AI Video Studio
        </a>
        <div className="header-actions">
          <button className="btn btn-ghost" aria-label="Sign in">
            Sign in
          </button>
        </div>
      </header>

      <main className="main">
        {/* Hero / Input Section */}
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero-title">
            Type an idea. Watch it become video.
          </h1>
          <p className="hero-subtitle">
            Describe any story, lesson, or scene. We'll write the script, generate images,
            record a voiceover, and assemble a complete video — all in your browser.
          </p>

          <div className="input-card">
            <label htmlFor="idea-input" className="input-label">
              Your idea
            </label>
            <textarea
              id="idea-input"
              className="idea-textarea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Example: A curious fox discovers a glowing mushroom in an ancient forest"
              rows={4}
              aria-describedby="idea-hint"
            />
            <div id="idea-hint" className="sr-only">
              Type a story idea. Press Enter to create a new line.
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                {loading ? "Creating…" : "Create Video"}
              </button>
            </div>
          </div>

          {/* Capabilities bar */}
          <div className="capabilities" role="list" aria-label="What this creates">
            <div className="capability" role="listitem">
              <svg className="capability-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              4–6 Scenes
            </div>
            <div className="capability" role="listitem">
              <svg className="capability-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              AI Images
            </div>
            <div className="capability" role="listitem">
              <svg className="capability-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
              Voiceover
            </div>
            <div className="capability" role="listitem">
              <svg className="capability-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              Final Video
            </div>
          </div>

          {/* Showcase / Example videos */}
          <div className="showcase" aria-label="Example videos">
            <p className="showcase-label">See what it can do</p>
            <div className="showcase-grid" role="list">
              {EXAMPLE_PROMPTS.map((prompt, idx) => (
                <article key={idx} className="showcase-item" role="listitem">
                  <div className="showcase-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="23 7 16 12 23 17 23 7"></polygon>
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                    </svg>
                    <span>{prompt}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Progress Overlay */}
        <div ref={progressOverlayRef} className="progress-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="progress-title">
          <div className="progress-card">
            <h2 id="progress-title" className="progress-title">Creating your video</h2>
            <p className="progress-subtitle">This usually takes 30–60 seconds</p>
            <div className="progress-steps" ref={progressStepsRef} role="status" aria-live="polite">
              {progressSteps.map((step, idx) => (
                <div key={step.key} className={`progress-step ${idx < progressStep ? 'done' : idx === progressStep ? 'active' : ''}`}>
                  <div className="progress-step-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {idx < progressStep ? (
                        <polyline points="20 6 9 17 4 12"></polyline>
                      ) : idx === progressStep ? (
                        <circle cx="12" cy="12" r="10"></circle>
                      ) : (
                        <circle cx="12" cy="12" r="10"></circle>
                      )}
                    </svg>
                  </div>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(progressStep / 4) * 100}%` }}></div>
            </div>
            <p className="progress-message">
              {progressStep === 0 && "Thinking about your story…"}
              {progressStep === 1 && "Generating beautiful images…"}
              {progressStep === 2 && "Recording natural voiceover…"}
              {progressStep === 3 && "Animating scenes…"}
              {progressStep === 4 && "Almost done…"}
            </p>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="error-banner" role="alert">
            <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p className="error-message">{error}</p>
            <button className="error-dismiss" onClick={() => setError("")} aria-label="Dismiss error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )}

        {/* Results / Scene Gallery */}
        {hasAnyScene && (
          <section className="result-section" aria-labelledby="result-title">
            <div className="result-header">
              <h2 id="result-title" className="result-title">{result.title}</h2>
              <div className="result-meta">
                <span className="result-character">{result.character}</span>
                <span>{result.scenes.length} scenes</span>
              </div>
            </div>

            <div className="scenes-wrapper">
              <p className="scenes-label">Scenes</p>
              <div className="scenes-track" role="list">
                {result.scenes.map((s, i) => {
                  const img = images[i];
                  const voice = voices[i];
                  const clip = clips[i];
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
                          <img src={img.url} alt={`Scene ${i + 1} illustration`} />
                        ) : (
                          <div className="showcase-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                          </div>
                        )}
                        {img?.status === "loading" && (
                          <div className="scene-loading" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
                          </div>
                        )}
                      </div>
                      <div className="scene-content">
                        <div className="scene-header">
                          <span className="scene-number">Scene {i + 1}</span>
                          <span className={`scene-status ${clip?.status === 'done' ? 'ready' : clip?.status === 'loading' ? 'generating' : img?.status === 'error' || voice?.status === 'error' ? 'error' : 'ready'}`}>
                            {clip?.status === 'done' ? 'Ready' : clip?.status === 'loading' ? 'Animating…' : 'Static'}
                          </span>
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
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                              {clip?.status === "done" ? "Re-animate" : "Animate"}
                            </button>
                          )}
                          {img?.status === "error" && (
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => makeImage(s, i, result.character, STYLES[style])}
                            >
                              Retry Image
                            </button>
                          )}
                          {voice?.status === "error" && (
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => makeVoice(s, i)}
                            >
                              Retry Voice
                            </button>
                          )}
                        </div>
                        {clip?.status === "loading" && (
                          <p className="progress-message" style={{ margin: 0, fontSize: 'var(--text-small)' }}>{clip.message}</p>
                        )}
                        {clip?.status === "error" && (
                          <p className="error-message" style={{ margin: 0, fontSize: 'var(--text-small)' }}>{clip.message}</p>
                        )}
                        {voice?.status === "done" && (
                          <audio className="scene-audio" controls src={voice.url} aria-label={`Scene ${i + 1} narration`} />
                        )}
                        {voice?.status === "loading" && (
                          <p className="progress-message" style={{ margin: 0, fontSize: 'var(--text-small)' }}>Recording voice…</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Final Video Section */}
            {allReady && (
              <section className="final-section" aria-labelledby="final-title">
                <div className="final-header">
                  <h2 id="final-title" className="final-title">Final Video</h2>
                </div>

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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download Video
                      </a>
                      <button className="btn btn-secondary" onClick={() => { setVideo(null); setMusic(null); }}>
                        Make Another
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="final-video-wrapper">
                      <div className="showcase-placeholder" style={{ background: 'var(--ink)' }}>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                        <span>Ready to assemble</span>
                      </div>
                    </div>
                    <div className="final-actions">
                      <label className="music-input">
                        <input type="file" accept="audio/*" onChange={(e) => setMusic(e.target.files[0] || null)} id="music-file" className="sr-only" />
                        <span className="music-label" htmlFor="music-file">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                          Add Music (optional)
                        </span>
                        {music && (
                          <span className="music-selected">
                            <span>{music.name}</span>
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => setMusic(null)} aria-label="Remove music">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          </span>
                        )}
                      </label>
                      <button
                        className="btn btn-primary"
                        onClick={makeVideo}
                        disabled={building}
                        aria-busy={building}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                        {building ? "Assembling…" : "Make Final Video"}
                      </button>
                    </div>
                    {progress && <p className="progress-message" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>{progress}</p>}
                  </>
                )}
              </section>
            )}
          </section>
        )}

        {/* Empty State */}
        {!hasAnyScene && !loading && !error && (
          <section className="empty-state" aria-labelledby="empty-title">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <h2 id="empty-title" className="empty-title">Ready when you are</h2>
            <p className="empty-description">
              Type a story idea above, or try one of these examples to see the magic.
            </p>
            <div className="empty-examples" role="list" aria-label="Example prompts">
              {EXAMPLE_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  className="example-chip"
                  onClick={() => fillExample(prompt)}
                  role="listitem"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* HF Token Section */}
        <section className="token-section" aria-labelledby="token-heading">
          <button
            className="token-toggle"
            onClick={() => setShowToken(!showToken)}
            aria-expanded={showToken}
            aria-controls="token-content"
            id="token-heading"
          >
            <span>Optional: More free AI video quota</span>
            <svg className="token-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div className="token-content" id="token-content" role="region" aria-labelledby="token-heading">
            <p className="token-description">
              AI animation uses a free public Hugging Face service with a small daily limit.
              A free Hugging Face account gives a bit more quota: create a <strong>Read</strong> token at
              <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">huggingface.co/settings/tokens</a>
              and paste it here. It stays in this page only and is sent only to Hugging Face.
            </p>
            <div className="token-input-wrapper">
              <label htmlFor="hf-token" className="sr-only">Hugging Face token</label>
              <input
                id="hf-token"
                type="password"
                className="token-input"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="hf_..."
                aria-describedby="token-hint"
              />
              <button className="btn btn-secondary" type="button" onClick={() => setShowToken(false)}>Done</button>
            </div>
            <p id="token-hint" className="sr-only">Paste your Hugging Face read token here</p>
          </div>
        </section>
      </main>

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