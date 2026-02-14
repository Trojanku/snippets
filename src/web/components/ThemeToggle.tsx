import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    // Load saved preference
    const saved = localStorage.getItem("theme-preference") as "light" | "dark" | "system" | null;
    if (saved) {
      setTheme(saved);
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    // Apply theme
    const root = document.documentElement;
    let activeTheme = theme;

    if (theme === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    root.classList.remove("light", "dark");
    root.classList.add(activeTheme);

    // Save preference
    localStorage.setItem("theme-preference", theme);
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
      className="theme-toggle"
      onClick={handleToggle}
      title={`Theme: ${theme} (click to cycle)`}
      aria-label="Toggle theme"
    >
      {getIcon()}
    </button>
  );
}
