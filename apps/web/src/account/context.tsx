// Fetches the signed-in user's Account once and exposes it (and the
// terminology derived from it) to the rest of the app — see
// apps/web/src/auth/context.tsx for the equivalent auth abstraction this
// sits on top of. App.tsx uses `account?.onboardingCompletedAt` from here
// to decide whether to show OnboardingPage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { INDUSTRY_PRESETS } from "@trade-platform/shared-types";
import { useAuthToken } from "../auth/context.js";
import { getAccount, type Account } from "../api-client/account.js";

interface AccountContextValue {
  account: Account | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuthToken();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setAccount(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setAccount(await getAccount(token));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AccountContextValue>(
    () => ({ account, loading, error, refresh }),
    [account, loading, error, refresh],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used within <AccountProvider>");
  }
  return ctx;
}

/**
 * Terminology for the current account, falling back to the generic OTHER
 * preset while loading or before onboarding has set real labels — so
 * every consuming component can read `terminology.job.plural` etc.
 * unconditionally instead of null-checking.
 */
export function useTerminology() {
  const { account } = useAccount();
  const fallback = INDUSTRY_PRESETS.OTHER;

  return useMemo(() => {
    if (!account) return fallback;
    return {
      job: {
        singular: account.jobLabelSingular ?? fallback.job.singular,
        plural: account.jobLabelPlural ?? fallback.job.plural,
      },
      customer: {
        singular: account.customerLabelSingular ?? fallback.customer.singular,
        plural: account.customerLabelPlural ?? fallback.customer.plural,
      },
      asset: {
        singular: account.assetLabelSingular ?? fallback.asset.singular,
        plural: account.assetLabelPlural ?? fallback.asset.plural,
      },
    };
  }, [account, fallback]);
}
