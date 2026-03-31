import { MonitorPlay, Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { useDemo } from "./DemoProvider";

export function DemoButton(): JSX.Element {
  const demo = useDemo();
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (demo.isActive && !demo.isPaused) {
      // Running → pause
      demo.pause();
      return;
    }
    if (demo.isActive && demo.isPaused) {
      // Paused → resume
      demo.resume();
      return;
    }
    // Not active
    if (demo.hasStoredProgress) {
      setShowPopover((prev) => !prev);
    } else {
      demo.start();
    }
  };

  const handleStartOver = () => {
    setShowPopover(false);
    demo.start();
  };

  const handleResume = () => {
    setShowPopover(false);
    demo.resume();
  };

  // Close popover on outside click
  const handleBlur = (e: React.FocusEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.relatedTarget as Node)) {
      setShowPopover(false);
    }
  };

  const isRunning = demo.isActive && !demo.isPaused;
  const isPaused = demo.isActive && demo.isPaused;

  return (
    <div className="relative" onBlur={handleBlur}>
      <button
        onClick={handleClick}
        data-demo="demo-button"
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          isRunning
            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            : isPaused
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {isRunning ? (
          <>
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pause</span>
          </>
        ) : isPaused ? (
          <>
            <Play className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resume</span>
          </>
        ) : (
          <>
            <MonitorPlay className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Demo</span>
          </>
        )}
      </button>

      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          <button
            onClick={handleStartOver}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <Play className="h-3.5 w-3.5" />
            Start over
          </button>
          <button
            onClick={handleResume}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <MonitorPlay className="h-3.5 w-3.5" />
            Resume demo
          </button>
          <button
            onClick={() => { setShowPopover(false); demo.dismiss(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
