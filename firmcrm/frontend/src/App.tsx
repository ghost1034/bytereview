import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import Shell from "@/components/layout/Shell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import LeadsPage from "@/pages/LeadsPage";
import AccountsPage from "@/pages/AccountsPage";
import AccountDetailPage from "@/pages/AccountDetailPage";
import ContactsPage from "@/pages/ContactsPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import OpportunitiesPage from "@/pages/OpportunitiesPage";
import OpportunityDetailPage from "@/pages/OpportunityDetailPage";
import ClearancePage from "@/pages/ClearancePage";
import EngagementsPage from "@/pages/EngagementsPage";
import CampaignsPage from "@/pages/CampaignsPage";
import TasksPage from "@/pages/TasksPage";
import ReportsPage from "@/pages/ReportsPage";
import AdminPage from "@/pages/AdminPage";
import DataPage from "@/pages/DataPage";
import SettingsPage, { ForcedPasswordChangePage } from "@/pages/SettingsPage";
import { Spinner } from "@/components/ui";
import { TourProvider } from "@/components/tour/Tour";
import { NotFound } from "@/components/ui/facts";

export default function App() {
  const { user, loading, atLeast } = useAuth();
  if (loading) return <div className="h-full grid place-items-center"><Spinner /></div>;
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TourProvider>
        <Routes>
          {!user ? (
            <>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : user.must_change_password ? (
            /* Forced change owns its URL so the address bar and Back/Forward stay honest (flows QA #24). */
            <>
              <Route path="/change-password" element={<ForcedPasswordChangePage />} />
              <Route path="*" element={<Navigate to="/change-password" replace />} />
            </>
          ) : (
            <Route element={<Shell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/accounts/:id" element={<AccountDetailPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/contacts/:id" element={<ContactDetailPage />} />
              <Route path="/opportunities" element={<OpportunitiesPage />} />
              <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
              <Route path="/clearance" element={<ClearancePage />} />
              <Route path="/engagements" element={<EngagementsPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {atLeast("manager") && <Route path="/data" element={<DataPage />} />}
              {atLeast("manager") && <Route path="/admin" element={<AdminPage />} />}
              {/* Once the forced change succeeds the URL is still /change-password; send the user home rather than to a 404. */}
              <Route path="/change-password" element={<Navigate to="/" replace />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound what="Page" backTo="/" backLabel="Back to dashboard" hint="The address may be mistyped, or the page may have moved." />} />
            </Route>
          )}
        </Routes>
        </TourProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
