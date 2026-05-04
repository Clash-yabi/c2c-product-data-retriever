import { Download, ChevronLeft } from "lucide-react";

interface DownloadSectionProps {
  onDownload: () => void;
  onClear: () => void;
  disabled: boolean;
}

export function DownloadSection({
  onDownload,
  onClear,
  disabled,
}: DownloadSectionProps) {
  return (
    <section className="action-container center">
      <button className="btn btn-error" onClick={onClear} disabled={disabled}>
        <ChevronLeft />
        Clear & Start Over
      </button>
      <button
        onClick={onDownload}
        className="btn btn-success"
        disabled={disabled}
      >
        <Download />
        Download Excel Report
      </button>
    </section>
  );
}
