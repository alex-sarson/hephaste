// Thin auth abstraction so the rest of the app (App.tsx, api-client callers)
// doesn't need to know whether it's running against real Clerk or the local
// dev bypass — it just calls useAuthToken(). See
// apps/api/src/lib/devAuth.ts for the matching backend bypass.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
} from "@clerk/clerk-react";

export const isDevAuth = import.meta.env.VITE_AUTH_MODE === "dev";

interface AuthContextValue {
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthToken(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthToken must be used within <AppAuthProvider>");
  }
  return ctx;
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useClerkAuth();
  const value = useMemo<AuthContextValue>(
    () => ({ isSignedIn: !!isSignedIn, getToken: () => getToken() }),
    [isSignedIn, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Matches DEV_ACCOUNT_AUTH_ID's resolution in apps/api/src/lib/devAuth.ts —
// the API doesn't actually inspect this value when AUTH_MODE=dev, but it's
// sent as a real bearer token so request shapes match production.
const DEV_TOKEN = "dev-local-token";

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (isDevAuth) {
    const value: AuthContextValue = {
      isSignedIn: true,
      getToken: async () => DEV_TOKEN,
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    console.error("VITE_CLERK_PUBLISHABLE_KEY is not set — see .env.example");
  }

  return (
    <ClerkProvider publishableKey={publishableKey ?? ""}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
