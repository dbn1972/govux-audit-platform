"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

export const THEME_KEY = "govux-theme";
type Theme = "light" | "dark";

/** Light/dark control.
 *
 *  The choice is the browser's, not the account's: it belongs to the device you
 *  are reading on — a projector in a review meeting wants light even when the
 *  laptop is set dark — and keeping it out of the database means it also works
 *  on the landing page and the sign-in screen, where there is no account yet.
 *
 *  The applied theme is set before first paint by an inline script in the root
 *  layout; this component only flips it afterwards.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setTheme((el.getAttribute("data-theme") as Theme) || "light");
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    // data-theme is UX4G's single theme switch.
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    setTheme(next);
  }

  // Rendered inert until mounted: the server cannot know the stored choice, and
  // guessing produces a button whose label contradicts the screen for a frame.
  return (
    <button type="button" onClick={toggle} className={`ux4g-icon-btn ux4g-icon-btn-text-primary ux4g-icon-btn-md ${className}`}
      aria-label={ready ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : "Switch theme"}
      title={ready ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : undefined}>
      <Icon name={theme === "dark" ? "sun" : "moon-stars"} size={17} />
    </button>
  );
}
