"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@solderlab/ui";
import { sendProjectChat, type ChatTurn } from "@/lib/chat-client";
import { CopilotMark } from "@/components/copilot-mark";

const SUGGESTIONS = [
  "What's on this board?",
  "Which nets look like power rails?",
  "Explain the latest uploaded revision",
  "Suggest review checks I should run",
];

export function AiChatThread({
  orgSlug,
  projectSlug,
  variant,
}: {
  orgSlug: string;
  projectSlug: string;
  variant: "page" | "popup";
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    try {
      const result = await sendProjectChat({
        orgSlug,
        projectSlug,
        message,
        messages: history,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply },
      ]);
    } catch (e) {
      setError((e as Error).message || "Assistant failed");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const empty = messages.length === 0;

  return (
    <div
      className={cx(
        "flex min-h-0 flex-1 flex-col",
        variant === "page" ? "mx-auto w-full max-w-3xl" : "min-h-0",
      )}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {empty ? (
          <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent-2)]">
              <CopilotMark size={22} />
            </span>
            <p className="text-base font-semibold tracking-tight text-[var(--text)]">
              Ask Copilot
            </p>
            <p className="max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
              Ask about uploaded KiCad files. Electrical names come from the
              parsed board.
            </p>
            <div className="mt-1 flex w-full flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s)}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-left text-[13px] text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={`${m.role}-${i}`} className="flex gap-2.5">
              {m.role === "assistant" ? (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent-2)]">
                  <CopilotMark size={12} />
                </span>
              ) : (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[10px] font-semibold text-[var(--text-muted)]">
                  You
                </span>
              )}
              <div className="min-w-0 flex-1 whitespace-pre-wrap pt-0.5 text-[13px] leading-relaxed text-[var(--text-soft)]">
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-center gap-2 pl-8 text-[13px] text-[var(--text-muted)]">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-2)]" />
            Thinking…
          </div>
        ) : null}
        {error ? (
          <p className="text-[13px] text-[var(--danger)]">{error}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="shrink-0 border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-inset)] px-2 py-1.5 focus-within:border-[var(--accent)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask Copilot"
            disabled={busy}
            aria-label="Message"
            className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M1.75 1.04c-.3-.17-.67.08-.64.43l.88 8.02a.5.5 0 0 0 .3.38l4.4 1.76v2.62a.75.75 0 0 0 1.5 0v-2.2l4.72 1.89a.5.5 0 0 0 .68-.45L15.9 1.5a.4.4 0 0 0-.54-.4L1.75 1.04Zm1.4 1.6 10.7.47-1.2 9.3-9.5-3.8-.88-5.97Z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-subtle)]">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
