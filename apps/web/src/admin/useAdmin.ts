// Whether the signed-in user is also an admin, decided by the API rather than
// anything client-side: GET /admin/me succeeds only for a valid Admin
// identity. In production the tenant Clerk session is not an admin identity
// (separate Clerk instance, brief §5.3), so this stays false and the Admin
// section simply never appears; under the dev-auth bypass the API treats the
// dev user as a SUPERADMIN.
import { useEffect, useState } from "react";
import { useAuthToken } from "../auth/context.js";
import { getAdminIdentity, type AdminIdentity } from "../api-client/admin.js";

export function useAdmin(): AdminIdentity | null {
  const { isSignedIn, getToken } = useAuthToken();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setAdmin(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const identity = await getAdminIdentity(token);
        if (!cancelled) setAdmin(identity);
      } catch {
        if (!cancelled) setAdmin(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  return admin;
}
