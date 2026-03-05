import { useEffect, useState } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2500);
    const t2 = setTimeout(() => onDone(), 3100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(160deg, #0d1a12 0%, #080808 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.6s ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "all",
        userSelect: "none",
      }}
    >
      {/* Ambient glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)",
          animation: "splashGlow 2.4s ease-in-out infinite alternate",
        }}
      />

      {/* C Logo */}
      <div
        style={{
          animation: "splashLogoIn 0.75s cubic-bezier(0.34,1.56,0.64,1) forwards",
          opacity: 0,
          filter: "drop-shadow(0 0 24px rgba(22,163,74,0.45))",
        }}
      >
        <svg width="108" height="108" viewBox="0 0 32 32">
          <path
            d="M 24.36 6.04 A 13 13 0 1 0 24.36 25.96 L 20.50 21.36 A 7 7 0 1 1 20.50 10.64 Z"
            fill="#16A34A"
          />
        </svg>
      </div>

      {/* Brand text */}
      <div
        style={{
          animation: "splashTextIn 0.5s 0.5s ease forwards",
          opacity: 0,
          textAlign: "center",
          marginTop: 22,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "0.1em",
            color: "#ffffff",
            fontFamily: "'Inter', sans-serif",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Crybaby
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.55em",
            color: "#16A34A",
            textTransform: "uppercase",
            marginTop: 7,
            paddingLeft: "0.55em", // optically center the tracked text
          }}
        >
          Golf
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          animation: "splashTextIn 0.5s 0.85s ease forwards",
          opacity: 0,
          marginTop: 36,
          fontSize: 13,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "0.06em",
          fontStyle: "italic",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Let's play.
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 3,
          background: "linear-gradient(90deg, #16A34A 0%, #22c55e 100%)",
          animation: "splashProgress 2.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards",
        }}
      />
    </div>
  );
}
