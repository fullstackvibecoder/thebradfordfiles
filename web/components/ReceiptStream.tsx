"use client";
import { useState, useCallback } from "react";
import { VerificationTrail, type ToolCallEvent } from "@/components/VerificationTrail";
import { SingleAnswerCard } from "@/components/SingleAnswerCard";
import { ComparisonCard } from "@/components/ComparisonCard";
import { RecordTrailCard } from "@/components/RecordTrailCard";
import { validateCard, type AnyCard } from "@/lib/card-types";

interface State {
  query: string;
  events: ToolCallEvent[];
  card: AnyCard | null;
  complete: boolean;
  error: string | null;
}

const INITIAL: State = { query: "", events: [], card: null, complete: false, error: null };

export function useReceiptStream() {
  const [state, setState] = useState<State>(INITIAL);

  const submit = useCallback(async (query: string, token: string) => {
    setState({ query, events: [], card: null, complete: false, error: null });
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, turnstile_token: token }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "unknown" }));
        setState(s => ({ ...s, error: err.error ?? "error", complete: true }));
        return;
      }
      const reader = r.body?.getReader();
      if (!reader) { setState(s => ({ ...s, error: "no_stream", complete: true })); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\n\n/);
        buffer = events.pop() ?? "";
        for (const block of events) {
          const lines = block.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!event) continue;
          const data = dataStr ? JSON.parse(dataStr) : {};
          if (event === "tool_call") {
            setState(s => {
              const others = s.events.filter(e => !(e.tool === data.tool && JSON.stringify(e.args) === JSON.stringify(data.args)));
              return { ...s, events: [...others, data] };
            });
          } else if (event === "card") {
            const card = validateCard(data.payload);
            setState(s => ({ ...s, card, complete: true }));
          } else if (event === "done") {
            setState(s => ({ ...s, complete: true }));
          }
        }
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), complete: true }));
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, submit, reset };
}

export function ReceiptStream({ state, onFollowUp }: { state: State; onFollowUp: (q: string) => void }) {
  if (!state.query) return null;
  return (
    <div className="px-8">
      <div className="max-w-[780px] mx-auto mb-2">
        <div className="font-sans text-[14px] text-muted mb-1.5">You asked</div>
        <div className="font-sans font-semibold text-[22px] leading-[1.3] text-ink tracking-tight">{state.query}</div>
      </div>
      <VerificationTrail events={state.events} complete={state.complete} />
      {state.error && (
        <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm p-6 text-center">
          <p className="font-sans text-[14px] text-muted">Could not produce a sourced answer for this question.</p>
          <button onClick={() => onFollowUp("")} className="chip mt-3">Try a different question</button>
        </div>
      )}
      {state.card?.type === "single_answer" && <SingleAnswerCard card={state.card} onFollowUp={onFollowUp} />}
      {state.card?.type === "comparison" && <ComparisonCard card={state.card} onFollowUp={onFollowUp} />}
      {state.card?.type === "record_trail" && <RecordTrailCard card={state.card} onFollowUp={onFollowUp} />}
    </div>
  );
}
