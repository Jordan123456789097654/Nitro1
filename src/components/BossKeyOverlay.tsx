import React, { useState, useEffect } from "react";

export function BossKeyOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle stealth Boss Key on ~ (Backquote) or Alt+B
      if (e.key === "`" || e.key === "~" || (e.altKey && e.key.toLowerCase() === "b")) {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          setActive(prev => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    (window as any).__toggleBossKey = () => setActive(prev => !prev);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 999999,
        background: "#ffffff",
        color: "#202124",
        fontFamily: "'Roboto', Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        userSelect: "none"
      }}
    >
      {/* Google Docs Top Header Bar */}
      <div style={{ background: "#f8f9fa", borderBottom: "1px solid #dadce0", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", background: "#2684fc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "1.2rem" }}>
            📄
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 500, color: "#202124" }}>AP Calculus BC - Chapter 4 Derivatives Notes</span>
              <span style={{ fontSize: "0.75rem", color: "#5f6368", background: "#e8eaed", padding: "2px 6px", borderRadius: "4px" }}>Saved to Drive</span>
            </div>
            <div style={{ display: "flex", gap: "14px", fontSize: "0.82rem", color: "#5f6368", marginTop: "2px" }}>
              <span style={{ cursor: "pointer" }} onClick={() => setActive(false)} title="Click to restore Nitro OS">File</span>
              <span style={{ cursor: "pointer" }}>Edit</span>
              <span style={{ cursor: "pointer" }}>View</span>
              <span style={{ cursor: "pointer" }}>Insert</span>
              <span style={{ cursor: "pointer" }}>Format</span>
              <span style={{ cursor: "pointer" }}>Tools</span>
              <span style={{ cursor: "pointer" }}>Extensions</span>
              <span style={{ cursor: "pointer" }}>Help</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "0.8rem", color: "#5f6368" }}>Press <code>~</code> or <code>Alt+B</code> to exit</span>
          <button
            onClick={() => setActive(false)}
            style={{
              padding: "8px 16px",
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            🔒 Exit Stealth Mode
          </button>
        </div>
      </div>

      {/* Docs Toolbar */}
      <div style={{ background: "#edf2fc", borderBottom: "1px solid #dadce0", padding: "6px 16px", display: "flex", gap: "16px", fontSize: "0.82rem", color: "#444746" }}>
        <span>100% ▾</span>
        <span>Normal text ▾</span>
        <span>Arial ▾</span>
        <span>11 ▾</span>
        <strong style={{ cursor: "pointer" }}>B</strong>
        <span style={{ fontStyle: "italic", cursor: "pointer" }}>I</span>
        <span style={{ textDecoration: "underline", cursor: "pointer" }}>U</span>
        <span>A ▾</span>
        <span>🔗 Insert link</span>
        <span>💬 Comment</span>
      </div>

      {/* Document Workspace Body */}
      <div style={{ flex: 1, background: "#f8f9fa", padding: "24px", overflowY: "auto", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "816px",
            minHeight: "1056px",
            background: "#ffffff",
            boxShadow: "0 1px 3px rgba(60,64,67,0.15)",
            padding: "72px 96px",
            fontSize: "11pt",
            lineHeight: 1.6,
            color: "#000"
          }}
        >
          <h1 style={{ fontSize: "20pt", fontWeight: 700, margin: "0 0 16px 0", color: "#1a73e8" }}>
            Section 4.2: Implicit Differentiation and Optimization
          </h1>
          <p style={{ color: "#3c4043", marginBottom: "16px" }}>
            <strong>Definition:</strong> When an equation defines <em>y</em> implicitly as a function of <em>x</em>, we calculate the derivative <em>dy/dx</em> using the chain rule with respect to <em>x</em> across both sides of the equation.
          </p>

          <h2 style={{ fontSize: "14pt", fontWeight: 600, margin: "20px 0 10px 0", color: "#202124" }}>
            Example 1: Find dy/dx for x² + y² = 25
          </h2>
          <ol style={{ paddingLeft: "24px", margin: "0 0 16px 0" }}>
            <li>Differentiate both sides with respect to <em>x</em>: d/dx(x²) + d/dx(y²) = d/dx(25)</li>
            <li>Apply power rule & chain rule: 2x + 2y(dy/dx) = 0</li>
            <li>Solve for dy/dx: 2y(dy/dx) = -2x  ⇒  <strong>dy/dx = -x / y</strong></li>
          </ol>

          <h2 style={{ fontSize: "14pt", fontWeight: 600, margin: "20px 0 10px 0", color: "#202124" }}>
            Optimization Guidelines
          </h2>
          <ul style={{ paddingLeft: "24px", margin: "0 0 16px 0" }}>
            <li>Identify all given quantities and quantities to be determined.</li>
            <li>Write a primary equation for the quantity that is to be maximized or minimized.</li>
            <li>Reduce the primary equation to one having a single independent variable.</li>
            <li>Determine the feasible domain of the primary equation.</li>
            <li>Determine the critical values by setting the first derivative to zero (f'(x) = 0).</li>
          </ul>

          <div style={{ marginTop: "32px", padding: "16px", background: "#f1f3f4", borderLeft: "4px solid #1a73e8", borderRadius: "4px" }}>
            <strong>Note for Exam Review:</strong> Remember that critical points occur where f'(x) = 0 or where f'(x) is undefined within the interior of the domain.
          </div>
        </div>
      </div>
    </div>
  );
}
