"use client";

import { useRef, useState } from "react";
import type { Dictionary } from "@/lib/client/i18n";
import { consumeChatSseStream } from "@/lib/client/sseChat";
import type { AirContext, Profile } from "@/lib/types";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  toolUsed?: boolean;
}

function updateLastAssistant(prev: ChatMsg[], updater: (prevMsg: ChatMsg) => ChatMsg): ChatMsg[] {
  const copy = [...prev];
  const last = copy[copy.length - 1];
  if (last?.role === "assistant") {
    copy[copy.length - 1] = updater(last);
  }
  return copy;
}

function ChatMessageList({
  messages,
  sending,
  dict,
}: {
  messages: readonly ChatMsg[];
  sending: boolean;
  dict: Dictionary;
}) {
  if (messages.length === 0) return null;
  return (
    <div className="mt-3 space-y-3" aria-live="polite">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-xl p-3 text-sm ${
            m.role === "user"
              ? "ml-6 bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100"
              : "mr-6 border border-teal-700/30 bg-teal-50/70 text-slate-950 dark:border-teal-400/30 dark:bg-teal-950/40 dark:text-slate-100"
          }`}
        >
          <p className="whitespace-pre-wrap">
            <span className="sr-only">
              {m.role === "user" ? dict.plan.chatYouLabel : dict.plan.chatAssistantLabel}:{" "}
            </span>
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
  );
}

function ChatInputBar({
  input,
  sending,
  dict,
  onInputChange,
  onSubmit,
}: {
  input: string;
  sending: boolean;
  dict: Dictionary;
  onInputChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
      <label htmlFor="whatif-chat-input" className="sr-only">
        {dict.plan.chatHeading}
      </label>
      <input
        id="whatif-chat-input"
        type="text"
        maxLength={500}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
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
  );
}

async function streamChatTurn(
  payload: {
    profile: Profile;
    context: AirContext;
    history: { role: "user" | "assistant"; text: string }[];
    message: string;
  },
  networkErrorText: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>,
): Promise<void> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      setMessages((prev) => updateLastAssistant(prev, (m) => ({ ...m, text: networkErrorText })));
      return;
    }

    let usedTool = false;
    await consumeChatSseStream(res.body, {
      onTool: () => {
        usedTool = true;
      },
      onChunk: (delta) => {
        setMessages((prev) =>
          updateLastAssistant(prev, (m) => ({ ...m, text: m.text + delta, toolUsed: usedTool })),
        );
      },
      onDone: (finalText, used) => {
        setMessages((prev) =>
          updateLastAssistant(prev, (m) => ({ ...m, text: finalText, toolUsed: used })),
        );
      },
    });
  } catch (err) {
    console.warn(
      "[ChatDrawer] streamChatTurn failed:",
      err instanceof Error ? err.message : String(err),
    );
    setMessages((prev) =>
      updateLastAssistant(prev, (m) => ({ ...m, text: m.text || networkErrorText })),
    );
  }
}

/** Grounded streaming chat drawer calling /api/chat with simulate_scenario tool support. */
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
  const nextIdRef = useRef(1);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const userId = nextIdRef.current++;
    const botId = nextIdRef.current++;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed },
      { id: botId, role: "assistant", text: "" },
    ]);
    setInput("");
    setSending(true);
    try {
      await streamChatTurn(
        { profile, context, history, message: trimmed },
        dict.plan.chatNetworkError,
        setMessages,
      );
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
      <ChatMessageList messages={messages} sending={sending} dict={dict} />
      <ChatInputBar
        input={input}
        sending={sending}
        dict={dict}
        onInputChange={setInput}
        onSubmit={handleSend}
      />
    </section>
  );
}
