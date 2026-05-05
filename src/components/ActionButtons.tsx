import { Rocket, Pipette, Square } from "lucide-react";

interface ActionButtonsProps {
  onStartFull: () => void;
  onStartTest: (limit: number) => void;
  onStop: () => void;
  isExtracting: boolean;
}

export function ActionButtons({
  onStartFull,
  onStartTest,
  onStop,
  isExtracting,
}: ActionButtonsProps) {
  return (
    <section className="action-container center">
      {!isExtracting ? (
        <>
          <button
            className="btn btn-primary"
            onClick={onStartFull}
          >
            <span>
              <Rocket />
            </span>{" "}
            Start Full Extraction
          </button>
          <button
            className="btn btn-outline"
            onClick={() => onStartTest(15)}
          >
            <span>
              <Pipette />
            </span>{" "}
            Run Test (3 products)
          </button>
        </>
      ) : (
        <button
          className="btn btn-outline btn-stop"
          onClick={onStop}
          style={{ borderColor: "#ff4d4d", color: "#ff4d4d" }}
        >
          <span>
            <Square fill="#ff4d4d" size={16} />
          </span>{" "}
          Stop Extraction
        </button>
      )}
    </section>
  );
}
