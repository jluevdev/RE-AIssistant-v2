import { Routes, Route } from 'react-router-dom';
import RequireAuthLayout from './components/layout/RequireAuthLayout';
import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import DashboardShell from './features/dashboard/DashboardShell';
import OpenHouseManager from './features/openHouse/OpenHouseManager';
import PublicCheckIn from './features/openHouse/PublicCheckIn';
import ListingHub from './features/offers/ListingHub';
import ListingCreate from './features/offers/ListingCreate';
import OfferCompare from './features/offers/OfferCompare';
import OfferDetail from './features/offers/OfferDetail';
import BillingPage from './features/billing/BillingPage';
import BillingSuccessPage from './features/billing/BillingSuccessPage';
import BuyerScheduling from './features/buyer/BuyerScheduling';
import BuyerClientPortal from './features/buyer/BuyerClientPortal';
import MessagesInbox from './features/messages/MessagesInbox';
import ContactsPage from './features/contacts/ContactsPage';
import AutomationsPage from './features/automations/AutomationsPage';
import TeamPage from './features/teams/TeamPage';
import JoinTeamPage from './features/teams/JoinTeamPage';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <Routes>
      {/* Public routes — no authenticated app shell */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/checkin/:openHouseId" element={<PublicCheckIn />} />
      <Route path="/listing/:hubSlug" element={<ListingHub />} />
      <Route path="/client/plan" element={<BuyerClientPortal />} />
      <Route path="/join/:token" element={<JoinTeamPage />} />

      {/* Authenticated routes — wrapped in AppLayout shell */}
      <Route element={<RequireAuthLayout />}>
        <Route path="/dashboard" element={<DashboardShell />} />
        <Route path="/open-houses" element={<OpenHouseManager />} />
        <Route path="/listings/new" element={<ListingCreate />} />
        <Route path="/offers" element={<OfferCompare />} />
        <Route path="/offers/:offerId" element={<OfferDetail />} />
        <Route path="/buyer/schedule" element={<BuyerScheduling />} />
        <Route path="/buyer/schedule/:scheduleId" element={<BuyerScheduling />} />
        <Route path="/messages" element={<MessagesInbox />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/billing/success" element={<BillingSuccessPage />} />
      </Route>
    </Routes>
  );
}
