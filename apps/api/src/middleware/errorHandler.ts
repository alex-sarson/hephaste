import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

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

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
