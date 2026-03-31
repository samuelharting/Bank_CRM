import { useEffect, useRef, useState } from "react";
import { useDemo } from "./DemoProvider";

const PADDING = 10;
const TOOLTIP_MAX_WIDTH = 380;
const TOOLTIP_GAP = 14;

interface Pos { top: number; left: number }

function computePos(
  rect: DOMRect,
  placement: "top" | "bottom" | "left" | "right",
  tw: number,
  th: number,
): Pos {
  let p = placement;
  if (p === "right" && rect.right + TOOLTIP_GAP + tw > window.innerWidth - PADDING) p = "left";
  if (p === "left" && rect.left - TOOLTIP_GAP - tw < PADDING) p = "right";
  if (p === "bottom" && rect.bottom + TOOLTIP_GAP + th > window.innerHeight - PADDING) p = "top";
  if (p === "top" && rect.top - TOOLTIP_GAP - th < PADDING) p = "bottom";

  let top = 0;
  let left = 0;
  switch (p) {
    case "bottom":
      top = rect.bottom + PADDING + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tw / 2;
      break;
    case "top":
      top = rect.top - PADDING - TOOLTIP_GAP - th;
      left = rect.left + rect.width / 2 - tw / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - th / 2;
      left = rect.right + PADDING + TOOLTIP_GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - th / 2;
      left = rect.left - PADDING - TOOLTIP_GAP - tw;
      break;
  }
  left = Math.max(PADDING, Math.min(left, window.innerWidth - tw - PADDING));
  top = Math.max(PADDING, Math.min(top, window.innerHeight - th - PADDING));
  return { top, left };
}

export function DemoOverlay(): JSX.Element | null {
  const demo = useDemo();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipH, setTooltipH] = useState(0);
  const tooltipW = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - PADDING * 2);
  const measuredH = tooltipH || 240;

  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipH(tooltipRef.current.getBoundingClientRect().height);
    }
  }, [demo.currentStep, demo.targetRect]);

  if (!demo.isActive || demo.isPaused || !demo.currentStep) return null;

  const { currentStep, stepIndex, totalSteps, targetRect, moduleProgress, isExecuting } = demo;
  const isModal = !currentStep.target || !targetRect;
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;
  const progressPct = ((stepIndex + 1) / totalSteps) * 100;

  // ── Progress bar (always shown at top) ──
  const progressBar = (
    <div className="fixed inset-x-0 top-0 z-[122] h-1 bg-slate-200">
      <div
        className="h-full bg-blue-600 transition-all duration-500 ease-out"
        style={{ width: `${progressPct}%` }}
      />
    </div>
  );

  // ── Controls row ──
  const controls = (
    <div className="mt-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          onClick={demo.pause}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Pause
        </button>
        <span className="text-slate-300">·</span>
        <button
          onClick={demo.skipModule}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Skip {moduleProgress.label}
        </button>
      </div>
      <div className="flex gap-2">
        {!isFirst && (
          <button
            onClick={demo.back}
            disabled={isExecuting}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Back
          </button>
        )}
        <button
          onClick={demo.next}
          disabled={isExecuting}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLast ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );

  // ── Module pill + step counter ──
  const header = (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        {moduleProgress.label}
      </span>
      <span className="text-xs text-slate-400">
        {moduleProgress.current}/{moduleProgress.total} · {stepIndex + 1} of {totalSteps}
      </span>
    </div>
  );

  // ── Executing spinner ──
  const executingIndicator = isExecuting ? (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      Setting up...
    </div>
  ) : null;

  // ── Modal mode (welcome / completion / no target) ──
  if (isModal) {
    return (
      <>
        {progressBar}
        <div className="fixed inset-0 z-[119] bg-slate-900/60" onClick={demo.pause} />
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            {header}
            <h3 className="mt-2 text-xl font-bold text-slate-900">{currentStep.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{currentStep.body}</p>
            {executingIndicator}
            {controls}
          </div>
        </div>
      </>
    );
  }

  // ── Spotlight mode ──
  const placement = currentStep.placement ?? "bottom";
  const pos = computePos(targetRect, placement, tooltipW, measuredH);

  return (
    <>
      {progressBar}

      {/* Click-blocking backdrop */}
      <div className="fixed inset-0 z-[119]" onClick={demo.pause} />

      {/* Spotlight cutout */}
      <div
        className="fixed z-[120] rounded-lg pointer-events-none transition-all duration-300 ease-out"
        style={{
          top: targetRect.top - PADDING,
          left: targetRect.left - PADDING,
          width: targetRect.width + PADDING * 2,
          height: targetRect.height + PADDING * 2,
          boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
        }}
      />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[121] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: tooltipW }}
      >
        {header}
        <h3 className="mt-2 text-base font-bold text-slate-900">{currentStep.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{currentStep.body}</p>
        {executingIndicator}
        {controls}
      </div>
    </>
  );
}
