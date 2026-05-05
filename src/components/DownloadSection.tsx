import { Download, ChevronLeft } from "lucide-react";

interface DownloadSectionProps {
  onDownload: () => void;
  onClear: () => void;
}

export function DownloadSection({
  onDownload,
  onClear,
}: DownloadSectionProps) {
  return (
    <section className="action-container center">
      <button className="btn btn-error" onClick={onClear}>
        <ChevronLeft />
        Clear & Start Over
      </button>
      <button
        onClick={onDownload}
        className="btn btn-success"
      >
        <Download />
        Download Excel Report
      </button>
    </section>
  );
}
