// The theme lives in localStorage and is applied on <html> by an inline script in <head>, before the
// first paint (no flash, no React warning about <script> tags).

export const THEME_KEY = "theme";

export type ThemePreference = "system" | "light" | "dark";

/** Applies the stored theme (or the system one) and follows system changes. */
export const HEAD_SCRIPT = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var k=s==="dark"||(s!=="light"&&m.matches);d.classList.toggle("dark",k);d.style.colorScheme=k?"dark":"light"}a();m.addEventListener("change",a);window.__applyTheme=a}catch(e){}})()`;

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Private mode or blocked storage: the choice just doesn't persist.
  }
  // Switch in one frame: without this, every colour transition plays at once.
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(pause);
  const apply = (window as Window & { __applyTheme?: () => void }).__applyTheme;
  if (apply) apply();
  else document.documentElement.classList.toggle("dark", pref === "dark");
  void document.body.offsetHeight;
  requestAnimationFrame(() => pause.remove());
}
