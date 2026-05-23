"use client";

import React, { useEffect, useRef } from "react";
import { Cpu } from "lucide-react";

interface TelemetryStreamProps {
  rawTelemetry: string;
}

export const TelemetryStream: React.FC<TelemetryStreamProps> = ({
  rawTelemetry,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [rawTelemetry]);

  // Fast, custom, client-side regex-based JSON syntax highlighting
  const highlightJSON = (jsonString: string): string => {
    if (!jsonString) return "";
    
    // Escape HTML to prevent injection vulnerabilities
    const safeHtml = jsonString
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Match JSON syntax parts
    return safeHtml.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "json-key";
          } else {
            cls = "json-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  };

  return (
    <div className="panel-card telemetry-container" style={{ flex: 1 }}>
      <div className="panel-header">
        <div className="panel-title">
          <Cpu size={14} style={{ color: "var(--accent-cyan)" }} />
          RAW SYSTEM TELEMETRY STREAM
        </div>
      </div>
      <div className="panel-content">
        <div 
          ref={containerRef}
          className="telemetry-stream-box"
          style={{ scrollBehavior: "smooth" }}
        >
          {rawTelemetry ? (
            <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "11px" }}>
              <code 
                dangerouslySetInnerHTML={{ __html: highlightJSON(rawTelemetry) }}
              />
            </pre>
          ) : (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Listening for active WebSocket packets...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
