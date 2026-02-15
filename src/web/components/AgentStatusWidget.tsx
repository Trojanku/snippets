import { useEffect, useMemo, useState } from "react";
import { api, type AgentStatus } from "../lib/api.ts";

function formatRelativeTime(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function AgentStatusWidget() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await api.getAgentStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent status");
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const tone = useMemo(() => {
    if (error || !status) {
      return {
        dot: "bg-danger",
        text: "text-danger",
        shell: "border-danger/40 bg-danger-soft/30",
        headline: "Unavailable",
        sub: "Status endpoint not responding",
      };
    }

    if (status.state === "offline") {
      return {
        dot: "bg-danger",
        text: "text-danger",
        shell: "border-danger/35 bg-danger-soft/25",
        headline: "Offline",
        sub: "Hooks token missing",
      };
    }

    if (status.state === "degraded") {
      return {
        dot: "bg-caution",
        text: "text-caution",
        shell: "border-caution/35 bg-caution/10",
        headline: "Degraded",
        sub: "Recent trigger failed",
      };
    }

    return {
      dot: "bg-success",
      text: "text-success",
      shell: "border-success/35 bg-accent-soft/45",
      headline: "Online",
      sub: "Listening for notes & actions",
    };
  }, [status, error]);

  return (
    <div className={`hidden items-center gap-2.5 rounded-full border px-3 py-1.5 md:flex ${tone.shell}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${status?.state === "online" ? "animate-pulse" : ""}`} />
      <p className="text-[11px] uppercase tracking-widest text-ink-soft">Agent</p>
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${tone.text}`}>{tone.headline}</span>
      {(status?.pendingQueue || status?.runningJobs) ? (
        <span className="text-[11px] text-ink-soft">{status?.pendingQueue ?? 0}p / {status?.runningJobs ?? 0}r</span>
      ) : null}
    </div>
  );
}
