import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";
import HamburgerMenu from "./HamburgerMenu";

export default function AppLayout() {
  return (
    <>
      {/* Global top bar: hamburger left, notification bell right */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 60,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 16px",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
      }}>
        <HamburgerMenu />
        <NotificationBell />
      </div>
      <Outlet />
      <BottomNav />
    </>
  );
}
