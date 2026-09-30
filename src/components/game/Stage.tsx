"use client";
import { useEffect, type ReactNode } from "react";
import "./game.css";
import { applyMotionAttr, useSettings } from "./settings";

/**
 * The frame every game screen sits in: the drifting pastel wash, the grain and
 * the scoped tokens. It also applies the player's reduce-motion setting to the
 * document so the stylesheet can honour it as well as the OS preference.
 */
export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [settings] = useSettings();
  useEffect(() => applyMotionAttr(settings), [settings]);
  return (
    <div className={`gx ${className}`}>
      <div className="gx-wash" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {children}
    </div>
  );
}
