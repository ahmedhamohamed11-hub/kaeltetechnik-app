import { useRef, useState, useEffect } from "react";

export type SwipePhase = "idle" | "swiping" | "exiting-right" | "exiting-left";

export interface UseSwipeOptions {
  onRight: () => void;
  onLeft: () => void;
  onRightStart?: () => void;
  onLeftStart?: () => void;
  threshold?: number;
  enabled?: boolean;
}

export interface UseSwipeReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  cardStyle: React.CSSProperties;
  overlayStrength: number;
  showRight: boolean;
  showLeft: boolean;
}

export function useSwipe({
  onRight,
  onLeft,
  onRightStart,
  onLeftStart,
  threshold = 60,
  enabled = true,
}: UseSwipeOptions): UseSwipeReturn {
  const elRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const lockAxis = useRef<"h" | "v" | null>(null);
  const dxRef = useRef(0);
  const exiting = useRef(false);

  const [displayDx, setDisplayDx] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>("idle");

  const cbRef = useRef({ onRight, onLeft, onRightStart, onLeftStart });
  useEffect(() => {
    cbRef.current = { onRight, onLeft, onRightStart, onLeftStart };
  });

  useEffect(() => {
    const el = elRef.current;
    if (!el || !enabled) return;

    function reset() {
      exiting.current = false;
      dxRef.current = 0;
      lockAxis.current = null;
      setDisplayDx(0);
      setPhase("idle");
    }

    function handleStart(e: TouchEvent) {
      if (exiting.current) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      lockAxis.current = null;
      dxRef.current = 0;
      setDisplayDx(0);
      setPhase("idle");
    }

    function handleMove(e: TouchEvent) {
      if (exiting.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (!lockAxis.current) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          lockAxis.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
        }
      }
      if (lockAxis.current !== "h") return;

      e.preventDefault();
      dxRef.current = dx;
      setDisplayDx(dx);
      setPhase("swiping");
    }

    function handleEnd() {
      if (exiting.current || lockAxis.current !== "h") {
        if (!exiting.current) reset();
        return;
      }
      const dx = dxRef.current;
      if (dx > threshold) {
        exiting.current = true;
        setPhase("exiting-right");
        cbRef.current.onRightStart?.();
        setTimeout(() => {
          reset();
          cbRef.current.onRight();
        }, 280);
      } else if (dx < -threshold) {
        exiting.current = true;
        setPhase("exiting-left");
        cbRef.current.onLeftStart?.();
        setTimeout(() => {
          reset();
          cbRef.current.onLeft();
        }, 280);
      } else {
        reset();
      }
    }

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchmove", handleMove, { passive: false });
    el.addEventListener("touchend", handleEnd, { passive: true });
    el.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", reset);
    };
  }, [enabled, threshold]);

  let cardStyle: React.CSSProperties;
  if (phase === "exiting-right") {
    cardStyle = {
      transform: "translateX(135%) rotate(20deg)",
      transition: "transform 0.28s ease",
      willChange: "transform",
    };
  } else if (phase === "exiting-left") {
    cardStyle = {
      transform: "translateX(-135%) rotate(-20deg)",
      transition: "transform 0.28s ease",
      willChange: "transform",
    };
  } else if (phase === "swiping") {
    cardStyle = {
      transform: `translateX(${displayDx}px) rotate(${displayDx * 0.04}deg)`,
      transition: "none",
      willChange: "transform",
    };
  } else {
    cardStyle = { transform: "none", transition: "transform 0.22s ease" };
  }

  const overlayStrength = Math.min(Math.abs(displayDx) / threshold, 1);

  return {
    ref: elRef,
    cardStyle,
    overlayStrength,
    showRight: displayDx > 15,
    showLeft: displayDx < -15,
  };
}
