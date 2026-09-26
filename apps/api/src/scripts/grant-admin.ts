// Makes an existing Hephaste user an admin (or takes it away):
//
//   pnpm admin:grant <email> [SUPPORT|BILLING_OPS|SUPERADMIN]   (default SUPPORT)
//   pnpm admin:grant <email> --revoke
//
// Admins sign in exactly like customers; what makes someone an admin is a
// row in the `admins` table keyed by their Clerk user id (see
// middleware/requireAdmin.ts). Nothing in the tenant-facing app can write
// that table, and neither can the admin console's own database role — this
// script is the only way in, and it runs as the owner role (DATABASE_URL), so
// it's an operator action rather than something a request can trigger. The
// person must already have signed up so Clerk knows their user id.
import "../env.js";
import { createClerkClient } from "@clerk/backend";
import { privilegedPrisma } from "../lib/db.js";

const ROLES = ["SUPPORT", "BILLING_OPS", "SUPERADMIN"] as const;
type Role = (typeof ROLES)[number];

const args = process.argv.slice(2).filter((a) => a !== "--");
const revoke = args.includes("--revoke");
const [email, roleArg = "SUPPORT"] = args.filter((a) => !a.startsWith("--"));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!email || !email.includes("@")) {
  fail(
    "Usage: pnpm admin:grant <email> [SUPPORT|BILLING_OPS|SUPERADMIN] | --revoke",
  );
}
if (!(ROLES as readonly string[]).includes(roleArg)) {
  fail(`Unknown role "${roleArg}" — use one of ${ROLES.join(", ")}`);
}
const role = roleArg as Role;

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) fail("CLERK_SECRET_KEY is not set — see .env.example");

const clerk = createClerkClient({ secretKey });
const { data: users } = await clerk.users.getUserList({
  emailAddress: [email],
});
const user = users[0];
if (!user) {
  fail(
    `No Clerk user with the email ${email}. They need to sign up to Hephaste first.`,
  );
}

if (revoke) {
  const { count } = await privilegedPrisma.admin.deleteMany({
    where: { authProviderId: user.id },
  });
  console.log(
    count ? `Revoked admin access for ${email}.` : `${email} wasn't an admin.`,
  );
} else {
  const admin = await privilegedPrisma.admin.upsert({
    where: { authProviderId: user.id },
    update: { role, email },
    create: { authProviderId: user.id, email, role },
  });
  console.log(
    `${email} is now ${admin.role}. They'll see the Admin section next time they load the dashboard.`,
  );
}
await privilegedPrisma.$disconnect();
