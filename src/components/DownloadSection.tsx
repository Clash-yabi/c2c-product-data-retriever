import { Download, ChevronLeft } from "lucide-react";

interface DownloadSectionProps {
  onDownload: () => void;
  onClear: () => void;
  disabled: boolean;
}

export function DownloadSection({ onDownload, onClear, disabled }: DownloadSectionProps) {
  return (
    <section className="action-container center">
      <button onClick={onDownload} className="btn btn-success" disabled={disabled}>
        <span>
          <Download />
        </span>{" "}
        Download Excel Report
      </button>
      <button
        className="btn btn-error"
        onClick={onClear}
        disabled={disabled}
      >
        <span>
          <ChevronLeft />
        </span>{" "}
        Clear & Start Over
      </button>
    </section>
  );
}
