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
    // Apply theme to html element
    const html = document.documentElement;
    let activeTheme = theme;

    if (theme === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    // Remove all theme classes
    html.classList.remove("light", "dark", "system");
    
    // Add active theme class
    if (theme !== "system") {
      html.classList.add(activeTheme);
    }

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
      className="bg-transparent border border-line text-ink-soft text-lg px-2.5 py-1.75 rounded cursor-pointer transition-all duration-120 hover:bg-white/10 hover:border-focus hover:text-ink flex-shrink-0"
      onClick={handleToggle}
      title={`Theme: ${theme} (click to cycle)`}
      aria-label="Toggle theme"
    >
      {getIcon()}
    </button>
  );
}
