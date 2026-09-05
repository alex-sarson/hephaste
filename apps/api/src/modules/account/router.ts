import { Router } from "express";
import { onboardingRequestSchema } from "@trade-platform/shared-types";
import { resolveAccount } from "../../middleware/tenantScope.js";
import { prisma } from "../../lib/db.js";

export const accountRouter = Router();

accountRouter.use(resolveAccount);

accountRouter.get("/me", async (req, res) => {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: req.accountId! },
  });
  res.json(account);
});

// Serves both the required one-time onboarding questionnaire (brief §3a)
// and later terminology edits from Settings — the shape is identical, the
// only difference is whether onboardingCompletedAt is already set. Never
// re-touch onboardingCompletedAt on a repeat call: it's the gate the web
// app uses to decide whether to show the onboarding screen at all.
accountRouter.patch("/me/terminology", async (req, res) => {
  const input = onboardingRequestSchema.parse(req.body);
  const existing = await prisma.account.findUniqueOrThrow({
    where: { id: req.accountId! },
    select: { onboardingCompletedAt: true },
  });
  const account = await prisma.account.update({
    where: { id: req.accountId! },
    data: {
      ...input,
      onboardingCompletedAt: existing.onboardingCompletedAt ?? new Date(),
    },
  });
  res.json(account);
});

// TODO (Phase 1): PATCH /me — company profile update (business details, logo,
// bank details, default tax rate, invoice numbering prefix). Validate with a
// schema from @trade-platform/shared-types once defined.
