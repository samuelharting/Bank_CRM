import { useEffect, useRef, useState } from "react";
import { useTour } from "./TourProvider";

const PADDING = 8;
const TOOLTIP_MAX_WIDTH = 340;
const TOOLTIP_GAP = 12;

interface Pos { top: number; left: number }

function computeTooltipPos(
  rect: DOMRect,
  placement: "top" | "bottom" | "left" | "right",
  tooltipWidth: number,
  tooltipHeight: number,
): { pos: Pos; actualPlacement: string } {
  let p = placement;
  // Flip if overflowing
  if (p === "right" && rect.right + TOOLTIP_GAP + tooltipWidth > window.innerWidth - PADDING) p = "left";
  if (p === "left" && rect.left - TOOLTIP_GAP - tooltipWidth < PADDING) p = "right";
  if (p === "bottom" && rect.bottom + TOOLTIP_GAP + tooltipHeight > window.innerHeight - PADDING) p = "top";
  if (p === "top" && rect.top - TOOLTIP_GAP - tooltipHeight < PADDING) p = "bottom";

  let top = 0;
  let left = 0;
  switch (p) {
    case "bottom":
      top = rect.bottom + PADDING + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case "top":
      top = rect.top - PADDING - TOOLTIP_GAP - tooltipHeight;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + PADDING + TOOLTIP_GAP;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - PADDING - TOOLTIP_GAP - tooltipWidth;
      break;
  }

  // Clamp to viewport
  left = Math.max(PADDING, Math.min(left, window.innerWidth - tooltipWidth - PADDING));
  top = Math.max(PADDING, Math.min(top, window.innerHeight - tooltipHeight - PADDING));

  return { pos: { top, left }, actualPlacement: p };
}

/** Full-screen tour overlay: spotlight + tooltip card or centered modal. */
export function TourOverlay(): JSX.Element | null {
  const { isActive, currentStep, currentStepIndex, totalSteps, targetRect, next, back, skip, showPrompt, start, dismissPrompt } = useTour();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - PADDING * 2);
  const measuredTooltipHeight = tooltipHeight || 220;

  // Measure tooltip height for "top" placement
  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.getBoundingClientRect().height);
    }
  }, [currentStep, targetRect]);

  // Intercept Escape key when tour is active
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isActive, skip]);

  // --- Auto-start prompt banner ---
  if (showPrompt && !isActive) {
    return (
      <div className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 shadow-lg">
        <p className="text-sm font-medium text-white">
          New here? Take a quick guided tour of the CRM.
        </p>
        <button
          onClick={start}
          className="ml-4 rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 transition-colors"
        >
          Start Tour
        </button>
        <button
          onClick={dismissPrompt}
          className="ml-2 rounded-md px-3 py-1.5 text-sm font-medium text-blue-100 hover:text-white transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!isActive || !currentStep) return null;

  const isModal = !currentStep.target || !targetRect;
  const isLast = currentStepIndex === totalSteps - 1;
  const isFirst = currentStepIndex === 0;

  // --- Modal mode (welcome / completion) ---
  if (isModal) {
    return (
      <>
        <div className="fixed inset-0 z-[109] bg-slate-900/60" onClick={skip} />
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-medium text-slate-400">
              {currentStepIndex + 1} of {totalSteps}
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{currentStep.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{currentStep.body}</p>
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={skip}
                className="text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip tour
              </button>
              <div className="flex gap-2">
                {!isFirst && (
                  <button
                    onClick={back}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={next}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  {isLast ? "Finish" : isFirst ? "Let\u2019s go!" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Spotlight mode ---
  const placement = currentStep.placement ?? "bottom";
  const { pos } = computeTooltipPos(targetRect, placement, tooltipWidth, measuredTooltipHeight);

  return (
    <>
      {/* Click-blocking backdrop */}
      <div className="fixed inset-0 z-[109]" onClick={skip} />

      {/* Spotlight cutout */}
      <div
        className="fixed z-[110] rounded-lg pointer-events-none transition-all duration-300 ease-out"
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
        className="fixed z-[111] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: tooltipWidth }}
      >
        <p className="text-xs font-medium text-slate-400">
          {currentStepIndex + 1} of {totalSteps}
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-900">{currentStep.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{currentStep.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={skip}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
