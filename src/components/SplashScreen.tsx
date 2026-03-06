import { useEffect, useState } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";

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
        background: "#ffffff",
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
      <img
        src={crybabyLogo}
        alt="Crybaby Golf"
        style={{
          width: 220,
          objectFit: "contain",
          animation: "splashLogoIn 0.6s cubic-bezier(0.34,1.3,0.64,1) forwards",
          opacity: 0,
        }}
      />

      {/* Bottom progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 3,
          background: "#16A34A",
          animation: "splashProgress 2.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards",
        }}
      />
    </div>
  );
}
