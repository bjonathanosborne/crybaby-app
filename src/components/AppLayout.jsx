import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";

export default function AppLayout() {
  return (
    <>
      {/* Global notification bell - positioned top right */}
      <div style={{
        position: "fixed", top: 0, right: 0, zIndex: 60,
        padding: "env(safe-area-inset-top, 12px) 16px 0",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
      }}>
        <NotificationBell />
      </div>
      <Outlet />
      <BottomNav />
    </>
  );
}
