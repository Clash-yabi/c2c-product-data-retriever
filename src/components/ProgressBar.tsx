import React from "react";

interface ProgressBarProps {
  currentProduct: string;
  progress: number;
  total: number;
}

export function ProgressBar({ currentProduct, progress, total }: ProgressBarProps) {
  const progressPercent = total === 0 ? "5%" : `${(progress / total) * 100}%`;

  return (
    <section className="progress-container">
      <p className="progress-label">{currentProduct}</p>
      <div className="progress-bar-bg">
        <div
          className="progress-bar-fill"
          style={
            {
              "--progress": progressPercent,
            } as React.CSSProperties
          }
        ></div>
      </div>
      <p className="progress-status">
        {total === 0
          ? "Searching for products..."
          : `${progress} of ${total} products processed`}
      </p>
    </section>
  );
}
