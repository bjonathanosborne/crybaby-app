import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";
import HamburgerMenu from "./HamburgerMenu";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { ChevronLeft } from "lucide-react";

const ROOT_PATHS = ["/profile", "/feed", "/friends", "/groups", "/inbox", "/stats"];

// Header row height (px). Logo is 120px tall, centered in this row,
// so it overflows 30px above and 30px below → content offset = ROW_H + 30.
const ROW_H = 60;
const LOGO_H = 120;
const LOGO_OVERFLOW_BELOW = (LOGO_H - ROW_H) / 2; // 30px

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !ROOT_PATHS.includes(location.pathname);

  return (
    <>
      {/* ── Fixed header ── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Inner row — exact height so content offset is predictable */}
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

          {/* Logo — absolutely centred so it doesn't affect the row's height */}
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

      {/* ── Scrollable content ── */}
      {/* paddingTop = safe-area + row height + logo overflow below row */}
      <div style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${ROW_H + LOGO_OVERFLOW_BELOW}px)`,
        paddingBottom: "calc(max(8px, env(safe-area-inset-bottom)) + 64px)",
      }}>
        <Outlet />
      </div>

      <BottomNav />
    </>
  );
}
