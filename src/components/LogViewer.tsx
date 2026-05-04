import { Check, X, ChevronLeft } from "lucide-react";
import { RefObject } from "react";

interface LogViewerProps {
  logs: any[];
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
          {log.message}
        </p>
      ))}
      <div ref={logEndRef} />
    </aside>
  );
}
