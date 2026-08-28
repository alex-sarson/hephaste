import { Router } from "express";
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

// TODO (Phase 1): PATCH /me — company profile update (business details, logo,
// bank details, default tax rate, invoice numbering prefix). Validate with a
// schema from @trade-platform/shared-types once defined.
