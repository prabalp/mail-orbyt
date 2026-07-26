import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";
import { S3ObjectStorage } from "./s3-storage";

/**
 * Runs against the real MinIO instance from docker-compose (S3-compatible),
 * not a mock — this package exists specifically to wrap the AWS SDK, so a
 * mocked-SDK test would mostly just assert that our code calls the SDK the
 * way we wrote it to call the SDK.
 */
const config = {
  endpoint: "http://localhost:9000",
  region: "auto",
  bucket: "mail-orbyt-storage-test",
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  forcePathStyle: true,
};

describe.skipIf(!process.env.RUN_MINIO_TESTS)("S3ObjectStorage (against real MinIO)", () => {
  beforeAll(async () => {
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    await client
      .send(new CreateBucketCommand({ Bucket: config.bucket }))
      .catch((error: unknown) => {
        const code = (error as { name?: string }).name;
        if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") throw error;
      });
  });

  it("round-trips a text object", async () => {
    const storage = new S3ObjectStorage(config);
    await storage.putObject({
      key: "test/hello.txt",
      body: "hello world",
      contentType: "text/plain",
    });
    const result = await storage.getObject("test/hello.txt");
    expect(result.toString("utf-8")).toBe("hello world");
  });

  it("deletes an object", async () => {
    const storage = new S3ObjectStorage(config);
    await storage.putObject({ key: "test/to-delete.txt", body: "bye" });
    await storage.deleteObject("test/to-delete.txt");
    await expect(storage.getObject("test/to-delete.txt")).rejects.toThrow();
  });

  it("round-trips binary data unchanged", async () => {
    const storage = new S3ObjectStorage(config);
    const binary = Buffer.from([0, 1, 2, 255, 254, 253]);
    await storage.putObject({ key: "test/binary.bin", body: binary });
    const result = await storage.getObject("test/binary.bin");
    expect(result.equals(binary)).toBe(true);
  });
});
