import { Router } from "express";
import multer from "multer";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  createJobMaterialSchema,
  createJobSchema,
  isAllowedAttachmentMimeType,
  updateJobSchema,
  updateJobStatusSchema,
} from "@hephaste/shared-types";
import { resolveAccount } from "../../middleware/tenantScope.js";
import { buildAttachmentKey, deleteObject, getDownloadUrl, uploadObject } from "../../lib/storage.js";
import * as jobsRepo from "./repository.js";

// Follows the reference pattern in ../customers/router.ts (brief §7.2).
export const jobsRouter = Router();

jobsRouter.use(resolveAccount);

// Memory storage, not disk — files are capped at MAX_ATTACHMENT_SIZE_BYTES
// (10MB), small enough to buffer before the single uploadObject() call, and
// this avoids needing to clean up temp files on every code path (including
// the ones that reject or error out).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
});

jobsRouter.get("/", async (req, res) => {
  const jobs = await jobsRepo.findMany(req.accountId!);
  res.json(jobs);
});

jobsRouter.post("/", async (req, res) => {
  const input = createJobSchema.parse(req.body);
  const job = await jobsRepo.create(req.accountId!, input);
  if (!job) {
    // 404, not 403/400 — see brief §7: never confirm whether a resource
    // exists for another tenant, even indirectly via a referenced id.
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(201).json(job);
});

jobsRouter.get("/:id", async (req, res) => {
  const job = await jobsRepo.findById(req.accountId!, req.params.id);
  if (!job) {
    // 404, not 403 — see brief §7.
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

jobsRouter.patch("/:id", async (req, res) => {
  const input = updateJobSchema.parse(req.body);
  const updated = await jobsRepo.update(req.accountId!, req.params.id, input);
  if (!updated) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.patch("/:id/status", async (req, res) => {
  const { status } = updateJobStatusSchema.parse(req.body);
  const updated = await jobsRepo.updateStatus(req.accountId!, req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.delete("/:id", async (req, res) => {
  const deleted = await jobsRepo.softDelete(req.accountId!, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.post("/:id/materials", async (req, res) => {
  const input = createJobMaterialSchema.parse(req.body);
  const material = await jobsRepo.addMaterial(req.accountId!, req.params.id, input);
  if (!material) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(201).json(material);
});

jobsRouter.delete("/:id/materials/:materialId", async (req, res) => {
  const removed = await jobsRepo.removeMaterial(req.accountId!, req.params.id, req.params.materialId);
  if (!removed) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.post("/:id/attachments", upload.single("file"), async (req, res) => {
  // multer's own RequestHandler type isn't generic over the route's params
  // (it defaults to the plain ParamsDictionary, whose index signature is
  // `string | string[]`), so mixing it into this handler chain widens
  // req.params away from the `{ id: string }` Express 5's types would
  // otherwise infer from the route literal. The cast is safe: a named
  // `:id` segment is always a single string at runtime.
  const jobId = req.params.id as string;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  // multer's fileFilter runs before we know the job exists, so the mime
  // check happens here instead — a rejected file shouldn't depend on
  // whether the job lookup would otherwise 404 first.
  if (!isAllowedAttachmentMimeType(file.mimetype)) {
    res.status(400).json({
      error: `Unsupported file type: ${file.mimetype}`,
      allowed: ALLOWED_ATTACHMENT_MIME_TYPES,
    });
    return;
  }

  const key = buildAttachmentKey(req.accountId!, jobId, file.originalname);
  const attachment = await jobsRepo.addAttachment(req.accountId!, jobId, {
    fileUrl: key,
    originalFilename: file.originalname,
    fileType: file.mimetype,
    fileSizeBytes: file.size,
  });
  if (!attachment) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Upload after the DB row exists rather than before: if addAttachment
  // 404s (bad jobId), nothing was ever sent to the bucket. If the upload
  // itself throws, the errorHandler's 500 leaves a DB row with no matching
  // object — the download route below fails safely on that (its presign
  // still "succeeds" since it doesn't check existence, but the resulting
  // URL 404s), which is a lesser problem than the reverse order's orphaned
  // object with no record.
  await uploadObject(key, file.buffer, file.mimetype);

  res.status(201).json(attachment);
});

jobsRouter.get("/:id/attachments/:attachmentId/url", async (req, res) => {
  const attachment = await jobsRepo.findAttachment(req.accountId!, req.params.id, req.params.attachmentId);
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  const url = await getDownloadUrl(attachment.fileUrl);
  res.json({ url });
});

jobsRouter.delete("/:id/attachments/:attachmentId", async (req, res) => {
  const removed = await jobsRepo.removeAttachment(req.accountId!, req.params.id, req.params.attachmentId);
  if (!removed) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  // Best-effort: the DB row is already gone (the source of truth for what
  // the UI shows), so a storage hiccup here shouldn't turn into a 500 for
  // an action that, from the tenant's point of view, already succeeded.
  await deleteObject(removed.fileUrl).catch((err) => {
    console.error(`Failed to delete S3 object ${removed.fileUrl}:`, err);
  });
  res.status(204).end();
});
