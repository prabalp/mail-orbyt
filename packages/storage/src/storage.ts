/**
 * S3-compatible object storage abstraction. Every consumer depends on this
 * interface, never on `@aws-sdk/client-s3` directly, so the backing
 * provider (MinIO locally, any S3-compatible bucket in production) can be
 * swapped without touching call sites — consistent with this codebase's
 * rule that external providers are injected, not called directly.
 */
export interface ObjectStorage {
  putObject(params: { key: string; body: Buffer | string; contentType?: string }): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
