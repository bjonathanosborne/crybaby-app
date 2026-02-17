import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CrybabOnboarding from "./pages/CrybabOnboarding";
import CrybabySetupWizard from "./pages/CrybabySetupWizard";
import CrybabyActiveRound from "./pages/CrybabyActiveRound";
import CrybabyFeed from "./pages/CrybabyFeed";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CrybabOnboarding />} />
          <Route path="/setup" element={<CrybabySetupWizard />} />
          <Route path="/round" element={<CrybabyActiveRound />} />
          <Route path="/feed" element={<CrybabyFeed />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
