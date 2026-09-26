// Whether the signed-in user is also an admin, decided by the API rather than
// anything client-side: GET /admin/me succeeds only for a user with a row in
// the `admins` table (see apps/api/src/middleware/requireAdmin.ts). Admins sign
// in exactly like any other user; the Admin section of the app simply appears
// for those who hold a permission level. Hiding it here is a convenience — the
// API enforces the same rules on every /admin call.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import { useAuthToken } from "../auth/context.js";
import {
  getAdminIdentity,
  type AdminIdentity,
  type AdminRole,
} from "../api-client/admin.js";

interface AdminContextValue {
  admin: AdminIdentity | null;
  loading: boolean;
}

const AdminContext = createContext<AdminContextValue>({
  admin: null,
  loading: false,
});

export function AdminProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuthToken();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const identity = await getAdminIdentity(token);
        if (!cancelled) setAdmin(identity);
      } catch {
        // 403 for an ordinary user — the expected case, not an error.
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const value = useMemo(() => ({ admin, loading }), [admin, loading]);
  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  return useContext(AdminContext);
}

/**
 * Wraps an admin route: renders it for an admin holding one of `roles` (any
 * admin if omitted), otherwise sends the user back to the dashboard — so a
 * pasted /admin link from a non-admin lands somewhere sensible rather than on
 * a page full of 403s.
 */
export function AdminGate({
  roles,
  children,
}: {
  roles?: AdminRole[];
  children: ReactNode;
}) {
  const { admin, loading } = useAdmin();
  if (loading) return null;
  if (!admin || (roles && !roles.includes(admin.role)))
    return <Navigate to="/" replace />;
  return <>{children}</>;
}
