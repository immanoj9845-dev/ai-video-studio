import { useState } from "react";
import "./App.css";

export default function App() {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="app">
      <h1>AI Video Studio</h1>
      <p className="sub">Type an idea and get a full video script.</p>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Example: A little rabbit learns to count to ten"
        rows={3}
      />
      <button onClick={generate} disabled={loading || !idea.trim()}>
        {loading ? "Writing script..." : "Write Script"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <h2>{result.title}</h2>
          <p><b>Character:</b> {result.character}</p>
          {result.scenes.map((s, i) => (
            <div className="scene" key={i}>
              <h3>Scene {i + 1}</h3>
              <p><b>Narration:</b> {s.narration}</p>
              <p><b>Image:</b> {s.image_prompt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}