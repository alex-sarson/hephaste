// S3-compatible object storage — MinIO locally, Cloudflare R2 in prod (see
// brief §12 and infra/docker-compose.yml). Kept as a thin, mockable wrapper
// around the AWS SDK (`vi.mock("../../lib/storage.js")` in tests) so the
// attachments routes never make a real network call in the test suite —
// same isolation principle as the jobs-runner boundary around Resend.
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function bucket(): string {
  const value = process.env.S3_BUCKET;
  if (!value) throw new Error("S3_BUCKET is not set");
  return value;
}

// Constructed lazily (not at module load) so importing this file never
// throws in a process that hasn't configured S3 env vars but also never
// calls it — e.g. the shared vitest setup for unrelated modules.
let client: S3Client | undefined;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "auto",
      // Required for MinIO (bucket.host style URLs need real DNS); harmless
      // for R2, which supports path-style too.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

// Namespaced by account then job so a tenant's objects are never
// interleaved with another's in the bucket listing, and a random UUID (not
// the original filename) so two uploads named "photo.jpg" never collide.
export function buildAttachmentKey(accountId: string, jobId: string, originalFilename: string): string {
  const dotIndex = originalFilename.lastIndexOf(".");
  const ext = dotIndex > 0 ? originalFilename.slice(dotIndex) : "";
  return `attachments/${accountId}/${jobId}/${randomUUID()}${ext}`;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

// Attachments are stored in a private bucket (no public-read policy set up
// for either MinIO or R2 here), so downloads go through a short-lived
// presigned URL rather than a permanent public link.
export async function getDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
