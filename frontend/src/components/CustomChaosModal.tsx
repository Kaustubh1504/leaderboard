"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Zap } from "lucide-react";

interface CustomChaosModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

const MAX_PROMPT = 240;
const PLACEHOLDERS = [
  "China bans GPU exports to US firms effective midnight",
  "EU emergency AI Act bans foundation models above 10^25 FLOPs",
  "Sovereign default in Brazil triggers global credit crunch",
  "OpenAI announces free GPT-5 for all consumers indefinitely",
];

export const CustomChaosModal: React.FC<CustomChaosModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Rotate the placeholder each time the modal is opened so the operator
  // always sees a fresh suggestion of what to type.
  const placeholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];

  useEffect(() => {
    if (open) {
      setPrompt("");
      // Defer focus until after the modal paints.
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  // ESC closes the modal; Cmd/Ctrl+Enter submits.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt]);

  if (!open) return null;

  const trimmed = prompt.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX_PROMPT;

  function submit() {
    if (!valid) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <Zap size={16} style={{ color: "var(--accent-red)" }} />
            CUSTOM CHAOS INJECTION
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-blurb">
            Frame a market shock and the AI Operator will generate a structured
            event that hits the corps. Press <kbd>⌘/Ctrl</kbd>+<kbd>Enter</kbd> to fire.
          </p>
          <textarea
            ref={textareaRef}
            className="modal-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            maxLength={MAX_PROMPT}
            rows={4}
          />
          <div className="modal-charcount">
            {prompt.length} / {MAX_PROMPT}
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn primary"
            onClick={submit}
            disabled={!valid}
          >
            Inject Chaos
          </button>
        </div>
      </div>
    </div>
  );
};
