import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Home, Newspaper, Users, UsersRound, User, Settings, Bell, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";

const navItems = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/feed", label: "Feed", icon: Newspaper },
  { path: "/friends", label: "Friends", icon: Users },
  { path: "/groups", label: "Groups", icon: UsersRound },
  { path: "/profile", label: "Profile", icon: User },
  { path: "/notifications/settings", label: "Notification Settings", icon: Bell },
];

export default function HamburgerMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    // Navigation handled by AuthContext/ProtectedRoute after session clears
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-border text-foreground hover:bg-accent transition-colors cursor-pointer">
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <img src={crybabyLogo} alt="Crybaby" className="h-12 -my-2" />
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
