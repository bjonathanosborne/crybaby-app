import { useEffect, useState } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 3200);
    const t2 = setTimeout(() => onDone(), 3800);
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
        background: "#F5EFE0",
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
      <div
        style={{
          fontFamily: "'Pacifico', cursive",
          fontSize: 52,
          fontWeight: 400,
          color: "#2D5016",
          lineHeight: 1.15,
          textAlign: "center",
          animation: "splashSpin 3s ease-out forwards",
          opacity: 0,
        }}
      >
        Crybaby Golf
      </div>

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 3,
          background: "#2D5016",
          animation: "splashProgress 3s cubic-bezier(0.25, 0.1, 0.25, 1) forwards",
        }}
      />
    </div>
  );
}
