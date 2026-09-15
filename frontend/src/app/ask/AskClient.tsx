"use client";

import { useState } from "react";

type AskResponse = {
  sql: string;
  error: string | null;
  answer: string | null;
  rows: Record<string, unknown>[];
  row_count?: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AskClient() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.detail === "ANTHROPIC_API_KEY is not set in .env."
            ? "Set ANTHROPIC_API_KEY in the backend's .env to enable this page."
            : data.detail ?? "Request failed"
        );
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which meters used more than 5000 gallons last month?"
          className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-gray-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Asking..." : "Ask"}
        </button>
      </form>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</div>}

      {result && (
        <div>
          {result.error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
              {result.error}
            </div>
          )}
          {result.answer && <p className="text-sm mb-4 whitespace-pre-wrap">{result.answer}</p>}
          <button onClick={() => setShowRaw((v) => !v)} className="text-xs text-blue-700 hover:underline mb-2">
            {showRaw ? "Hide" : "Show"} SQL and raw results
          </button>
          {showRaw && (
            <div>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs overflow-x-auto mb-3">{result.sql}</pre>
              {result.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-left border-b border-gray-300">
                        {Object.keys(result.rows[0]).map((k) => (
                          <th key={k} className="py-1 pr-3">
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="py-1 pr-3">
                              {String(v ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
