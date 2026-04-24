import { Check, X, ChevronLeft } from "lucide-react";
import { Log } from "../hooks/useProductExtractor";
import { RefObject } from "react";

interface LogViewerProps {
  logs: Log[];
  logEndRef: RefObject<HTMLDivElement | null>;
}

export function LogViewer({ logs, logEndRef }: LogViewerProps) {
  return (
    <aside className="log-container">
      {logs.map((log, i) => (
        <p key={i} className={`log-entry ${log.type}`}>
          {log.type === "success" ? (
            <Check />
          ) : log.type === "error" ? (
            <X />
          ) : (
            <ChevronLeft />
          )}
          {log.msg}
        </p>
      ))}
      <div ref={logEndRef} />
    </aside>
  );
}
