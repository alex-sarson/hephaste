import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { InvalidInvoiceTransitionError } from "@hephaste/invoice-engine";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@hephaste/shared-types";

// Centralized error handling so route handlers can just `throw`.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }

  if (err instanceof InvalidInvoiceTransitionError) {
    // 409, not 400 — the request was well-formed, it's just illegal given
    // the invoice's current state (brief §4 state machine).
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof MulterError) {
    // Multer throws synchronously-caught-by-express-async-errors, not a
    // route-level try/catch, so it lands here rather than in the
    // attachments route itself.
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File too large — max ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB` });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
