import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import ResetPassword from "./pages/ResetPassword";
import CrybabOnboarding from "./pages/CrybabOnboarding";
import CrybabySetupWizard from "./pages/CrybabySetupWizard";
import CrybabyActiveRound from "./pages/CrybabyActiveRound";
import CrybabyFeed from "./pages/CrybabyFeed";
import ProfilePage from "./pages/ProfilePage";
import FriendsPage from "./pages/FriendsPage";
import GroupsPage from "./pages/GroupsPage";
import AppLayout from "./components/AppLayout";
import JoinGroupPage from "./pages/JoinGroupPage";
import NotificationSettings from "./pages/NotificationSettings";
import InboxPage from "./pages/InboxPage";
import StatsPage from "./pages/StatsPage";
import UserProfilePage from "./pages/UserProfilePage";
import NotFound from "./pages/NotFound";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminRoundsPage from "./pages/admin/AdminRoundsPage";
import AdminGroupsPage from "./pages/admin/AdminGroupsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>;
  return <Navigate to={user ? "/profile" : "/auth"} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/" element={<RootRedirect />} />
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/home" element={<Navigate to="/profile" replace />} />
      <Route path="/setup" element={<CrybabySetupWizard />} />
      <Route path="/round" element={<CrybabyActiveRound />} />
      <Route path="/feed" element={<CrybabyFeed />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/:userId" element={<UserProfilePage />} />
      <Route path="/notifications/settings" element={<NotificationSettings />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/stats" element={<StatsPage />} />
    </Route>
    <Route path="/join/:code" element={<ProtectedRoute><JoinGroupPage /></ProtectedRoute>} />
    <Route element={<AdminLayout />}>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/rounds" element={<AdminRoundsPage />} />
      <Route path="/admin/groups" element={<AdminGroupsPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
