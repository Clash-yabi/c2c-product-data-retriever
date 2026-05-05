import { Check, X, Info, AlertTriangle } from "lucide-react";
import { RefObject } from "react";
import { LogEntry } from "@/hooks/useProductExtractor";

interface LogViewerProps {
  logs: LogEntry[];
  logEndRef: RefObject<HTMLDivElement | null>;
}

export function LogViewer({ logs, logEndRef }: LogViewerProps) {
  return (
    <aside className="log-container">
      {logs.map((log, i) => (
        <p key={i} className={`log-entry ${log.type}`}>
          {log.type === "success" && <Check size={18} />}
          {log.type === "error" && <X size={18} />}
          {log.type === "warning" && <AlertTriangle size={18} />}
          {log.type === "info" && <Info size={18} />}
          <span>{log.message}</span>
        </p>
      ))}
      <div ref={logEndRef} />
    </aside>
  );
}
