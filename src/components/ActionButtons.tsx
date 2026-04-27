import { Rocket, Pipette } from "lucide-react";

interface ActionButtonsProps {
  onStartFull: () => void;
  onStartTest: (limit: number) => void;
  disabled: boolean;
}

export function ActionButtons({ onStartFull, onStartTest, disabled }: ActionButtonsProps) {
  return (
    <section className="action-container center">
      <button
        className="btn btn-primary"
        onClick={onStartFull}
        disabled={disabled}
      >
        <span>
          <Rocket />
        </span>{" "}
        Start Full Extraction
      </button>
      <button
        className="btn btn-outline"
        onClick={() => onStartTest(10)}
        disabled={disabled}
      >
        <span>
          <Pipette />
        </span>{" "}
        Run Test (5 products)
      </button>
    </section>
  );
}
