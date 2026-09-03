import { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Timer, X, Minimize2, Maximize2 } from "lucide-react";

export function PomodoroTimer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: any = null;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (mode === "work") {
        setMode("break");
        setTimeLeft(5 * 60);
        alert("🎉 Work session completed! Take a 5-minute break.");
      } else {
        setMode("work");
        setTimeLeft(25 * 60);
        alert("⚡ Break over! Time to focus.");
      }
      setIsRunning(false);
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft, mode]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === "work" ? 25 * 60 : 5 * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Open Study Pomodoro Timer"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 9999,
          background: "linear-gradient(135deg, #10b981, #059669)",
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontWeight: 700,
          fontSize: "13px",
          boxShadow: "0 8px 24px rgba(16, 185, 129, 0.4)",
          cursor: "pointer",
          transition: "transform 0.2s, box-shadow 0.2s"
        }}
      >
        <Timer size={16} />
        <span>Focus Timer</span>
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 9999,
          background: "rgba(10, 14, 23, 0.92)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(16, 185, 129, 0.4)",
          borderRadius: "999px",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 700,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
        }}
      >
        <span style={{ color: mode === "work" ? "#10b981" : "#38bdf8" }}>{mode === "work" ? "⚡ Work" : "☕ Break"}</span>
        <span style={{ fontFamily: "monospace", fontSize: "14px" }}>{formattedTime}</span>
        <button onClick={toggleTimer} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={() => setIsMinimized(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        width: "280px",
        background: "rgba(10, 14, 23, 0.95)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(16, 185, 129, 0.4)",
        borderRadius: "16px",
        padding: "16px",
        color: "#fff",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: 700, fontSize: "14px" }}>
          <Timer size={16} />
          <span>Pomodoro Timer</span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={() => setIsMinimized(true)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
            <Minimize2 size={14} />
          </button>
          <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "4px", marginBottom: "16px" }}>
        <button
          onClick={() => { setMode("work"); setTimeLeft(25 * 60); setIsRunning(false); }}
          style={{
            flex: 1,
            padding: "6px",
            border: "none",
            borderRadius: "6px",
            background: mode === "work" ? "#10b981" : "transparent",
            color: mode === "work" ? "#000" : "#cbd5e1",
            fontWeight: 700,
            fontSize: "12px",
            cursor: "pointer"
          }}
        >
          Work (25m)
        </button>
        <button
          onClick={() => { setMode("break"); setTimeLeft(5 * 60); setIsRunning(false); }}
          style={{
            flex: 1,
            padding: "6px",
            border: "none",
            borderRadius: "6px",
            background: mode === "break" ? "#38bdf8" : "transparent",
            color: mode === "break" ? "#000" : "#cbd5e1",
            fontWeight: 700,
            fontSize: "12px",
            cursor: "pointer"
          }}
        >
          Break (5m)
        </button>
      </div>

      <div style={{ textAlign: "center", fontSize: "2.4rem", fontWeight: 800, fontFamily: "monospace", letterSpacing: "2px", marginBottom: "16px", color: mode === "work" ? "#10b981" : "#38bdf8" }}>
        {formattedTime}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={toggleTimer}
          style={{
            flex: 2,
            padding: "10px",
            background: isRunning ? "#f59e0b" : "#10b981",
            border: "none",
            borderRadius: "8px",
            color: "#000",
            fontWeight: 800,
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            cursor: "pointer"
          }}
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
          <span>{isRunning ? "Pause" : "Start"}</span>
        </button>

        <button
          onClick={resetTimer}
          style={{
            flex: 1,
            padding: "10px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "8px",
            color: "#cbd5e1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
