import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";
import HamburgerMenu from "./HamburgerMenu";
import crybabyLogo from "@/assets/crybaby-logo.png";

export default function AppLayout() {
  return (
    <>
      {/* Global top bar: hamburger left, logo center, notification bell right */}
      <div className="fixed top-0 left-0 right-0 z-60 flex items-center justify-between px-3 bg-card/90 backdrop-blur-xl border-b border-border"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
          paddingBottom: "6px",
        }}>
        <HamburgerMenu />
        <img src={crybabyLogo} alt="Crybaby" className="h-[100px] -my-[24px] object-contain" />
        <NotificationBell />
      </div>
      <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 52px)" }}>
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
}
