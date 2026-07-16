import { useState } from "react";
import "./App.css";

type AgentLog = {
  step: number;
  action: string;
  reason: string;
  status: "success" | "error";
  error?: string;
};

type AgentResult = {
  success: boolean;
  result: string;
  finalUrl: string;
  screenshot?: string;
  logs: AgentLog[];
  error?: string;
};

export default function App() {
  const [url, setUrl] = useState("https://example.com");
  const [task, setTask] = useState(
    "Explain what this website is for."
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState("");

  async function runAgent() {
    try {
      setLoading(true);
      setError("");

      const apiUrl =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const response = await fetch(`${apiUrl}/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          task,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Agent failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">

      <aside className="sidebar">
        <h1>Wayfinder AI</h1>

        <label>Website</label>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label>Task</label>

        <textarea
          rows={8}
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />

        <button
          onClick={runAgent}
          disabled={loading}
        >
          {loading ? "Running..." : "Run Agent"}
        </button>

        {error && (
          <p className="error">
            {error}
          </p>
        )}
      </aside>

      <main className="main-panel">

        <section className="browser-panel">

          <div className="browser-toolbar">

            <div className="circle red"></div>
            <div className="circle yellow"></div>
            <div className="circle green"></div>

            <div className="address-bar">
              {result?.finalUrl ?? url}
            </div>

          </div>

          <div className="browser-view">

            {loading && (
              <div className="placeholder">
                <h2>Running Agent...</h2>
              </div>
            )}

            {!loading && result?.screenshot && (
              <img
                src={result.screenshot}
                alt="Browser"
              />
            )}

            {!loading && !result?.screenshot && (
              <div className="placeholder">
                <h2>No browser session</h2>
                <p>
                  Enter a URL and task to begin.
                </p>
              </div>
            )}

          </div>

        </section>

        <section className="result-panel">

          <h2>Final Answer</h2>

          <p>
            {result?.result ??
              "The agent response will appear here."}
          </p>

        </section>

      </main>

      <aside className="activity-panel">

        <h2>Agent Activity</h2>

        {result?.logs?.map((log) => (

          <div
            key={log.step}
            className="log"
          >
            <strong>{log.action}</strong>

            <p>{log.reason}</p>

          </div>

        ))}

      </aside>

    </div>
  );
}