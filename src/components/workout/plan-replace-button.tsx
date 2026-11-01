"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReplaceSheet } from "./replace-sheet";

export function PlanReplaceButton({ exerciseId, exerciseName, sessionKey, index }: { exerciseId: string; exerciseName: string; sessionKey: string; index: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 underline dark:text-brand-300">جایگزینی</button>
      {open && (
        <ReplaceSheet exerciseId={exerciseId} exerciseName={exerciseName} sessionKey={sessionKey} index={index} allowToday={false}
          onClose={() => setOpen(false)} onPlanReplaced={() => router.refresh()} />
      )}
    </>
  );
}
