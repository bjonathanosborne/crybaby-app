import { ErrorBoundary as REB } from "react-error-boundary";

function Fallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: 24,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>😬</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 24, lineHeight: 1.5 }}>
          {error?.message || "An unexpected error occurred."}
        </div>
        <button
          onClick={resetErrorBoundary}
          style={{
            padding: "12px 28px", borderRadius: 12, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 700,
            background: "#1A1A1A", color: "#fff",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <REB FallbackComponent={Fallback} onReset={() => window.location.reload()}>
      {children}
    </REB>
  );
}
