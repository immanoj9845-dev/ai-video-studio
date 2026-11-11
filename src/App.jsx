import { useState } from "react";
import "./App.css";

const STYLES = {
  Cartoon: "colorful 2D cartoon style, bold outlines, bright colors",
  Storybook: "soft watercolor children's storybook illustration",
  "3D": "cute 3D animated movie style, soft lighting",
};

export default function App() {
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("Cartoon");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [images, setImages] = useState({});
  const [voices, setVoices] = useState({});
  const [error, setError] = useState("");

  function setImg(i, value) {
    setImages((prev) => ({ ...prev, [i]: value }));
  }
  function setVoice(i, value) {
    setVoices((prev) => ({ ...prev, [i]: value }));
  }

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

  async function generate() {
    setLoading(true);
    setError("");
    setResult(null);
    setImages({});
    setVoices({});
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
      for (let i = 0; i < data.scenes.length; i++) {
        await makeImage(data.scenes[i], i, data.character, STYLES[style]);
        await makeVoice(data.scenes[i], i);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="app">
      <h1>AI Video Studio</h1>
      <p className="sub">Type an idea and get a script with pictures and voice.</p>

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

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <h2>{result.title}</h2>
          <p><b>Character:</b> {result.character}</p>
          {result.scenes.map((s, i) => {
            const img = images[i];
            const voice = voices[i];
            return (
              <div className="scene" key={i}>
                <h3>Scene {i + 1}</h3>
                {img?.status === "done" && <img src={img.url} alt={`Scene ${i + 1}`} />}
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
        </div>
      )}
    </div>
  );
}