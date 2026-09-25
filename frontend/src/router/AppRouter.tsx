import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/layout/AppShell';
import { RealtimeBoundary } from '../components/layout/RealtimeBoundary';
import { LoadingState } from '../components/ui/QueryState';
import { useAuth } from '../context/AuthContext';
import { LoginPage } from '../pages/Login/LoginPage';
import { ProtectedRoute } from './ProtectedRoute';

const DashboardPage = lazy(() =>
  import('../pages/Dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const VehiclesPage = lazy(() =>
  import('../pages/Vehicles/VehiclesPage').then((module) => ({
    default: module.VehiclesPage,
  })),
);
const VehicleDetailPage = lazy(() =>
  import('../pages/VehicleDetail/VehicleDetailPage').then((module) => ({
    default: module.VehicleDetailPage,
  })),
);
const AlertsPage = lazy(() =>
  import('../pages/Alerts/AlertsPage').then((module) => ({
    default: module.AlertsPage,
  })),
);
const MapPage = lazy(() =>
  import('../pages/Map/MapPage').then((module) => ({ default: module.MapPage })),
);
const UsersPage = lazy(() =>
  import('../pages/Users/UsersPage').then((module) => ({ default: module.UsersPage })),
);

function PageLoader({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Cargando pantalla" />}>{children}</Suspense>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return session?.user.role === 'ADMIN' ? children : <Navigate to="/" replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <RealtimeBoundary>
              <AppShell />
            </RealtimeBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<PageLoader><DashboardPage /></PageLoader>} />
        <Route path="vehicles" element={<PageLoader><VehiclesPage /></PageLoader>} />
        <Route path="vehicles/:id" element={<PageLoader><VehicleDetailPage /></PageLoader>} />
        <Route path="map" element={<PageLoader><MapPage /></PageLoader>} />
        <Route path="alerts" element={<PageLoader><AlertsPage /></PageLoader>} />
        <Route path="users" element={<AdminRoute><PageLoader><UsersPage /></PageLoader></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
