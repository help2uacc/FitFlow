"use client";
import { useState } from "react";
import { ProgressDashboard } from "./progress-dashboard";
import { BodyForm } from "./body-form";
import { ProgressPhotos } from "./photos";
import { AiAnalysis } from "./analysis";

export function ProgressPage({ today }: { today: string }) {
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-4">
      <BodyForm today={today} onSaved={() => setKey((k) => k + 1)} />
      <ProgressDashboard reloadKey={key} />
      <AiAnalysis />
      <ProgressPhotos today={today} />
    </div>
  );
}
