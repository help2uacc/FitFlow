"use client";
import { useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";

export interface TimerState { endAt: number | null; remainingMs: number; durationSec: number }

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio unavailable */
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60).toLocaleString("fa-IR")}:${(s % 60).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;
};

/**
 * Rest timer driven by an absolute end time (survives re-renders and
 * background throttling; the remaining time is recomputed on every tick).
 */
export function RestTimer({ timer, setTimer }: { timer: TimerState; setTimer: (t: TimerState) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);
  const running = timer.endAt !== null;
  const remaining = running ? timer.endAt! - now : timer.remainingMs;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && remaining <= 0 && fired.current !== timer.endAt) {
      fired.current = timer.endAt;
      beep();
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
      setTimer({ endAt: null, remainingMs: 0, durationSec: timer.durationSec });
    }
  }, [running, remaining, timer, setTimer]);

  const start = (sec = timer.durationSec) => { setNow(Date.now()); setTimer({ endAt: Date.now() + (timer.remainingMs > 0 && sec === timer.durationSec ? timer.remainingMs : sec * 1000), remainingMs: 0, durationSec: sec }); };
  const pause = () => setTimer({ endAt: null, remainingMs: Math.max(0, remaining), durationSec: timer.durationSec });
  const reset = () => setTimer({ endAt: null, remainingMs: 0, durationSec: timer.durationSec });
  const adjust = (d: number) => {
    const sec = Math.max(15, Math.min(600, timer.durationSec + d));
    if (running) setTimer({ endAt: timer.endAt! + d * 1000, remainingMs: 0, durationSec: sec });
    else setTimer({ ...timer, durationSec: sec });
  };

  const show = running || timer.remainingMs > 0;
  return (
    <div className={cx("safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:bottom-0 dark:border-slate-800 dark:bg-slate-950/95")} role="timer" aria-live="off">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">تایمر استراحت</div>
          <div className={cx("num text-2xl font-extrabold", running && remaining < 10000 ? "text-amber-600" : "text-brand-700 dark:text-brand-300")}>
            {show ? fmt(remaining) : fmt(timer.durationSec * 1000)}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => adjust(-15)} aria-label="۱۵ ثانیه کمتر">−۱۵</Button>
        <Button size="sm" variant="ghost" onClick={() => adjust(15)} aria-label="۱۵ ثانیه بیشتر">+۱۵</Button>
        {running ? <Button size="sm" variant="secondary" onClick={pause}>توقف</Button> : <Button size="sm" onClick={() => start()}>{timer.remainingMs > 0 ? "ادامه" : "شروع"}</Button>}
        <Button size="sm" variant="ghost" onClick={reset}>ریست</Button>
      </div>
    </div>
  );
}
