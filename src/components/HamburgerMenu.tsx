import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Newspaper, Inbox, Users, UsersRound, User, Bell, LogOut, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useState } from "react";


const navItems = [
  { path: "/profile", label: "Profile", icon: User },
  { path: "/inbox", label: "Inbox", icon: Inbox },
  { path: "/feed", label: "Feed", icon: Newspaper },
  { path: "/friends", label: "Friends", icon: Users },
  { path: "/groups", label: "Groups", icon: UsersRound },
  { path: "/notifications/settings", label: "Notification Settings", icon: Bell },
];

export default function HamburgerMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center justify-center w-11 h-11 rounded-xl bg-card border border-border text-foreground hover:bg-accent transition-colors cursor-pointer">
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-6 pt-8 pb-6 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400, color: "#2D5016", lineHeight: 1 }}>Crybaby Golf</span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors cursor-pointer border-none bg-transparent text-left ${
                  active
                    ? "text-primary bg-accent"
                    : "text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                {item.label}
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="border-t border-border my-2" />
              <button
                onClick={() => handleNav("/admin")}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors cursor-pointer border-none bg-transparent text-left text-primary hover:bg-accent/50"
              >
                <ShieldCheck size={18} />
                Admin Panel
              </button>
            </>
          )}
        </nav>

        <div className="border-t border-border p-2">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-none bg-transparent rounded-lg"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
