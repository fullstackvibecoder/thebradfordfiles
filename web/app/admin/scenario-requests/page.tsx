"use client";

import { useState } from "react";

interface RequestItem {
  query: string;
  count: number;
  latest: string;
  reasonings: string[];
}

export default function ScenarioRequestsPage() {
  const [secret, setSecret] = useState("");
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/scenario-requests", {
        headers: { authorization: "Bearer " + secret },
      });
      if (!r.ok) {
        setError("HTTP " + r.status);
        setLoading(false);
        return;
      }
      const data = await r.json();
      setItems(data.items as RequestItem[]);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function promote(item: RequestItem) {
    const slug = window.prompt("Slug for \"" + item.query.slice(0, 60) + "\"?");
    if (!slug) return;
    const topic = window.prompt("Topic statement (full)?");
    if (!topic) return;
    const topic_short = window.prompt("Topic short?");
    if (!topic_short) return;
    const r = await fetch("/api/admin/promote-to-skeleton", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + secret,
      },
      body: JSON.stringify({ slug, topic, topic_short, query: item.query }),
    });
    const data = await r.json();
    if (r.ok) window.alert("Skeleton written to " + data.path);
    else window.alert("Error: " + data.error);
  }

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <h1 className="font-serif text-3xl font-bold mb-6">Scenario request backlog</h1>
      <div className="mb-6 flex gap-2">
        <input
          type="password"
          placeholder="Admin shared secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="flex-1 border border-rule px-3 py-2 font-mono text-sm"
        />
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-accent text-accent-ink font-mono text-sm uppercase tracking-wider">
          {loading ? "Loading..." : "Load"}
        </button>
      </div>
      {error ? <p className="text-accent text-sm mb-4">Error: {error}</p> : null}
      {items === null ? (
        <p className="text-sm text-muted">Enter the shared secret and click Load.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No unmatched queries logged yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, i) => (
            <li key={i} className="border border-rule p-4">
              <p className="font-serif text-base mb-2">{item.query}</p>
              <p className="font-mono text-xs uppercase tracking-wider text-muted mb-2">
                {item.count}x . latest {item.latest}
              </p>
              {item.reasonings[0] ? <p className="text-xs text-muted italic mb-3">Agent reasoning: {item.reasonings[0]}</p> : null}
              <button
                onClick={() => promote(item)}
                className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 border border-accent text-accent"
              >
                Promote to skeleton
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
