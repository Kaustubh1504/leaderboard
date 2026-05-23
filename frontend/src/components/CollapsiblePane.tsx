"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Wrapper that lets a side column (left or right) collapse to a thin
 * vertical strip with just the expand handle. The parent owns the
 * collapsed state and re-renders the dashboard grid template-columns
 * accordingly (see page.tsx).
 *
 * When collapsed:
 *   - Renders a 32px-wide strip with the chevron + the label rotated 90°
 *   - Children are not mounted (cheap re-expand because rendering is fast)
 * When expanded:
 *   - Renders children + a small chevron on the inner edge
 */
interface CollapsiblePaneProps {
  side: "left" | "right";
  collapsed: boolean;
  onToggle: () => void;
  /** Short label shown vertically when collapsed (e.g. "LEADERBOARD") */
  collapsedLabel: string;
  children: React.ReactNode;
}

export const CollapsiblePane: React.FC<CollapsiblePaneProps> = ({
  side,
  collapsed,
  onToggle,
  collapsedLabel,
  children,
}) => {
  if (collapsed) {
    const Chevron = side === "left" ? ChevronRight : ChevronLeft;
    return (
      <div
        className={`collapsible-pane collapsed ${side}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        title="Click to expand"
      >
        <Chevron size={18} className="collapsible-chevron" />
        <div className="collapsible-vertical-label">{collapsedLabel}</div>
      </div>
    );
  }
  const Chevron = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div className={`collapsible-pane expanded ${side}`}>
      <button
        className={`collapsible-handle ${side}`}
        onClick={onToggle}
        title={`Collapse ${side} pane`}
        aria-label={`Collapse ${side} pane`}
      >
        <Chevron size={14} />
      </button>
      <div className="collapsible-content">{children}</div>
    </div>
  );
};
