import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";
import HamburgerMenu from "./HamburgerMenu";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { ChevronLeft } from "lucide-react";

const ROOT_PATHS = ["/home", "/feed", "/friends", "/groups", "/profile"];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !ROOT_PATHS.includes(location.pathname);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-60 flex items-center justify-between px-3 bg-card/90 backdrop-blur-xl border-b border-border"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
          paddingBottom: "6px",
        }}>
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
        <img src={crybabyLogo} alt="Crybaby" style={{ height: "120px", marginTop: "-30px", marginBottom: "-30px", objectFit: "contain" }} />
        <NotificationBell />
      </div>
      <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 68px)" }}>
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
}
