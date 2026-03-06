import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";
import HamburgerMenu from "./HamburgerMenu";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { ChevronLeft } from "lucide-react";
import { loadActiveRound } from "@/lib/db";

const ROOT_PATHS = ["/profile", "/feed", "/friends", "/groups", "/inbox", "/stats"];

// Header row height (px). Logo is 120px tall, centered in this row,
// so it overflows 30px above and 30px below → content offset = ROW_H + 30.
const ROW_H = 60;
const LOGO_H = 120;
const LOGO_OVERFLOW_BELOW = (LOGO_H - ROW_H) / 2; // 30px
const BANNER_H = 44; // active-round return banner height

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !ROOT_PATHS.includes(location.pathname);
  const [activeRound, setActiveRound] = useState(null);

  // Reload active round whenever location changes (e.g. user leaves /round)
  useEffect(() => {
    loadActiveRound()
      .then(r => setActiveRound(r))
      .catch(() => setActiveRound(null));
  }, [location.pathname]);

  const showBanner = !!activeRound;

  return (
    <>
      {/* ── Fixed header ── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className="flex items-center justify-between px-3"
          style={{ height: ROW_H, position: "relative" }}
        >
          <div className="flex items-center gap-1 min-w-[48px]">
            {showBack ? (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-transparent border-none cursor-pointer text-foreground hover:bg-accent transition-colors"
                aria-label="Go back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : null}
            <HamburgerMenu />
          </div>

          {/* Logo — absolutely centred */}
          <img
            src={crybabyLogo}
            alt="Crybaby"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              height: LOGO_H,
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />

          <NotificationBell />
        </div>
      </div>

      {/* ── Active Round Return Banner ── */}
      {showBanner && (
        <div
          onClick={() => { window.location.href = `/round?id=${activeRound.id}`; }}
          className="fixed left-0 right-0 z-40 flex items-center justify-between px-4 cursor-pointer"
          style={{
            bottom: `calc(64px + env(safe-area-inset-bottom, 0px))`,
            height: BANNER_H,
            background: "linear-gradient(90deg, #15803d 0%, #16a34a 100%)",
          }}
        >
          <div className="flex items-center gap-2.5">
            {/* Pulsing live dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <div>
              <div className="text-white text-[10px] font-bold uppercase tracking-widest leading-none">
                Round In Progress
              </div>
              <div className="text-white/90 text-xs font-semibold leading-tight truncate max-w-[200px]">
                {activeRound.course}
              </div>
            </div>
          </div>
          <div className="text-white text-xs font-bold flex items-center gap-1">
            Return →
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${ROW_H + LOGO_OVERFLOW_BELOW}px)`,
        paddingBottom: `calc(max(8px, env(safe-area-inset-bottom)) + 64px + ${showBanner ? BANNER_H : 0}px)`,
      }}>
        <Outlet />
      </div>

      <BottomNav />
    </>
  );
}
