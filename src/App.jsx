import { useState } from "react";
import "./App.css";
import { buildVideo } from "./buildVideo";
import { animateImage } from "./animate";

const STYLES = {
  Realistic:
    "photorealistic, cinematic lighting, natural colors, highly detailed, shot on a 35mm camera",
  Cartoon: "colorful 2D cartoon style, bold outlines, bright colors",
  Storybook: "soft watercolor children's storybook illustration",
  "3D": "cute 3D animated movie style, soft lighting",
};

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
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      await Promise.all(
        data.scenes.map((s, i) =>
          Promise.all([makeImage(s, i, data.character, STYLES[style]), makeVoice(s, i)])
        )
      );
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
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

  const allReady =
    result &&
    !loading &&
    result.scenes.every(
      (_, i) => images[i]?.status === "done" && voices[i]?.status === "done"
    );

  return (
    <div className="app">
      <h1>AI Video Studio</h1>
      <p className="sub">Type an idea and get a script with pictures, voice and video.</p>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Example: A little rabbit learns to count to ten"
        rows={3}
      />
      <div className="row">
        <select value={style} onChange={(e) => setStyle(e.target.value)}>
          {Object.keys(STYLES).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button onClick={generate} disabled={loading || !idea.trim()}>
          {loading ? "Working..." : "Create Script + Images + Voice"}
        </button>
      </div>

      <details className="tokenbox">
        <summary>Optional: more free AI video quota</summary>
        <p className="sub">
          AI animation uses a free public service with a small daily limit per person.
          A free Hugging Face account gives a bit more: create a "Read" token at
          huggingface.co/settings/tokens and paste it here. It stays in this page only
          and is sent only to Hugging Face.
        </p>
        <input
          type="password"
          value={hfToken}
          onChange={(e) => setHfToken(e.target.value)}
          placeholder="hf_..."
        />
      </details>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <h2>{result.title}</h2>
          <p><b>Character:</b> {result.character}</p>
          {result.scenes.map((s, i) => {
            const img = images[i];
            const voice = voices[i];
            const clip = clips[i];
            return (
              <div className="scene" key={i}>
                <h3>Scene {i + 1}</h3>
                {clip?.status === "done" ? (
                  <video className="clip" src={clip.url} autoPlay loop muted playsInline />
                ) : (
                  img?.status === "done" && <img src={img.url} alt={`Scene ${i + 1}`} />
                )}
                {img?.status === "loading" && <p className="sub">Drawing picture...</p>}
                {img?.status === "error" && (
                  <p className="error">
                    {img.message}{" "}
                    <button
                      className="small"
                      onClick={() => makeImage(s, i, result.character, STYLES[style])}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {img?.status === "done" && !loading && (
                  <button className="small" disabled={animating} onClick={() => animateScene(i)}>
                    {clip?.status === "done" ? "Animate again" : "Animate with AI (free, slow)"}
                  </button>
                )}
                {clip?.status === "loading" && <p className="sub">{clip.message}</p>}
                {clip?.status === "error" && <p className="error">{clip.message}</p>}

                <p><b>Narration:</b> {s.narration}</p>
                {voice?.status === "done" && <audio controls src={voice.url} />}
                {voice?.status === "loading" && <p className="sub">Recording voice...</p>}
                {voice?.status === "error" && (
                  <p className="error">
                    {voice.message}{" "}
                    <button className="small" onClick={() => makeVoice(s, i)}>
                      Retry
                    </button>
                  </p>
                )}
              </div>
            );
          })}

          {allReady && (
            <div className="scene">
              <h3>Final video</h3>
              <p className="sub">
                Optional: add your own background music (only use music you have the right to use).
              </p>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setMusic(e.target.files[0] || null)}
              />
              <button onClick={makeVideo} disabled={building}>
                {building ? "Recording..." : "Make Video"}
              </button>
              {progress && <p className="sub">{progress}</p>}
              {video && (
                <>
                  <video controls src={video.url} className="final" />
                  <a
                    className="download"
                    href={video.url}
                    download={`${(result.title || "video").replace(/[^a-z0-9]+/gi, "-")}.${video.ext}`}
                  >
                    Download video (.{video.ext})
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <footer className="footer">
        <p className="sub">
          AI results can contain mistakes. Your ideas are sent to Cloudflare AI (and
          Google Gemini as a backup) to create the script, pictures and voice. If you
          use AI animation, your picture is sent to a public Hugging Face service. There
          are no accounts, and videos are made in your own browser.
        </p>
      </footer>
    </div>
  );
}