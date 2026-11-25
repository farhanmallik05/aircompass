"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/client/i18n";
import type { AirContext, Profile } from "@/lib/types";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  toolUsed?: boolean;
}

export function ChatDrawer({
  profile,
  context,
  dict,
}: {
  profile: Profile;
  context: AirContext;
  dict: Dictionary;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed },
      { role: "assistant", text: "" },
    ]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, context, history, message: trimmed }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            text: "Could not reach chat service right now.",
          };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let usedTool = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          const evLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!evLine || !dataLine) continue;
          const evName = evLine.slice(6).trim();
          const payload = JSON.parse(dataLine.slice(5).trim()) as {
            text?: string;
            toolCallsExecuted?: number;
          };

          if (evName === "tool") {
            usedTool = true;
          } else if (evName === "chunk" && payload.text) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  text: last.text + payload.text,
                  toolUsed: usedTool,
                };
              }
              return copy;
            });
          } else if (evName === "done" && payload.text !== undefined) {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                role: "assistant",
                text: payload.text ?? "",
                toolUsed: usedTool || (payload.toolCallsExecuted ?? 0) > 0,
              };
              return copy;
            });
          }
        }
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-labelledby="chat-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 id="chat-heading" className="text-lg font-bold text-slate-950 dark:text-white">
        {dict.plan.chatHeading}
      </h2>

      {messages.length > 0 ? (
        <div className="mt-3 space-y-3" aria-live="polite">
          {messages.map((m, idx) => (
            <div
              key={`${m.role}-${idx}`}
              className={`rounded-xl p-3 text-sm ${
                m.role === "user"
                  ? "ml-6 bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100"
                  : "mr-6 border border-teal-700/30 bg-teal-50/70 text-slate-950 dark:border-teal-400/30 dark:bg-teal-950/40 dark:text-slate-100"
              }`}
            >
              <p className="whitespace-pre-wrap">
                {m.text || (sending ? dict.plan.chatSending : "")}
              </p>
              {m.toolUsed ? (
                <p className="mt-1.5 text-xs font-medium text-teal-900 dark:text-teal-200">
                  {dict.plan.chatToolNote}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSend} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="whatif-chat-input" className="sr-only">
          {dict.plan.chatHeading}
        </label>
        <input
          id="whatif-chat-input"
          type="text"
          maxLength={500}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={dict.plan.chatPlaceholder}
          className="min-h-11 flex-1 rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="min-h-11 rounded-xl bg-teal-800 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
        >
          {sending ? dict.plan.chatSending : dict.plan.chatSendBtn}
        </button>
      </form>
    </section>
  );
}
