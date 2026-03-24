import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Admin
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ClientList from "./pages/admin/ClientList";
import CreateClient from "./pages/admin/CreateClient";
import ClientDetail from "./pages/admin/ClientDetail";
import DailyConsumptions from "./pages/admin/DailyConsumptions";
import FlexibleOrders from "./pages/admin/FlexibleOrders";
import AdminPoints from "./pages/admin/AdminPoints";
import AdminRanking from "./pages/admin/AdminRanking";

import AdminLayout from "./components/AdminLayout";
import AdminGuard from "./components/AdminGuard";

// Client
import ClientLayout from "./components/ClientLayout";
import ClientHome from "./pages/client/ClientHome";
import ClientPlan from "./pages/client/ClientPlan";
import ClientHistory from "./pages/client/ClientHistory";
import ClientPoints from "./pages/client/ClientPoints";
import ClientRanking from "./pages/client/ClientRanking";
import ClientReferrals from "./pages/client/ClientReferrals";

const queryClient = new QueryClient();

function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminLayout>{children}</AdminLayout>
    </AdminGuard>
  );
}

function ClientPage({ children }: { children: React.ReactNode }) {
  return <ClientLayout>{children}</ClientLayout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          
          {/* Admin routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPage><AdminDashboard /></AdminPage>} />
          <Route path="/admin/clientes" element={<AdminPage><ClientList /></AdminPage>} />
          <Route path="/admin/clientes/nuevo" element={<AdminPage><CreateClient /></AdminPage>} />
          <Route path="/admin/clientes/:id" element={<AdminPage><ClientDetail /></AdminPage>} />
          <Route path="/admin/consumos" element={<AdminPage><DailyConsumptions /></AdminPage>} />
          <Route path="/admin/pedidos" element={<AdminPage><FlexibleOrders /></AdminPage>} />
          <Route path="/admin/puntos" element={<AdminPage><AdminPoints /></AdminPage>} />
          <Route path="/admin/ranking" element={<AdminPage><AdminRanking /></AdminPage>} />

          {/* Client routes */}
          <Route path="/cliente/:accessLink" element={<ClientPage><ClientHome /></ClientPage>} />
          <Route path="/cliente/:accessLink/plan" element={<ClientPage><ClientPlan /></ClientPage>} />
          <Route path="/cliente/:accessLink/historial" element={<ClientPage><ClientHistory /></ClientPage>} />
          <Route path="/cliente/:accessLink/puntos" element={<ClientPage><ClientPoints /></ClientPage>} />
          <Route path="/cliente/:accessLink/ranking" element={<ClientPage><ClientRanking /></ClientPage>} />
          <Route path="/cliente/:accessLink/referidos" element={<ClientPage><ClientReferrals /></ClientPage>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
