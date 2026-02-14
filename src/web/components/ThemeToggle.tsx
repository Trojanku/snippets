import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    // Load saved preference or default to system
    const saved = localStorage.getItem("theme-preference") as "light" | "dark" | "system" | null;
    if (saved) {
      setTheme(saved);
    } else {
      // Default to system preference
      setTheme("system");
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const activeTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      html.classList.remove("light", "dark");
      html.classList.add(activeTheme);
    };

    apply();
    const onMediaChange = () => {
      if (theme === "system") apply();
    };
    media.addEventListener("change", onMediaChange);
    localStorage.setItem("theme-preference", theme);

    return () => media.removeEventListener("change", onMediaChange);
  }, [theme]);

  const handleToggle = () => {
    setTheme((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  };

  const getIcon = () => {
    switch (theme) {
      case "light":
        return "☀️";
      case "dark":
        return "🌙";
      case "system":
        return "🖥";
    }
  };

  return (
    <button
      className="flex-shrink-0 rounded-full border border-line bg-paper/55 px-3 py-1.5 text-base text-ink-soft transition-colors hover:border-focus hover:bg-paper hover:text-ink"
      onClick={handleToggle}
      title={`Theme: ${theme} (click to cycle)`}
      aria-label="Toggle theme"
    >
      {getIcon()}
    </button>
  );
}
