import { loadEnv } from "@mail-orbyt/config";
import { S3ObjectStorage, type ObjectStorage } from "@mail-orbyt/storage";

const env = loadEnv();

export const objectStorage: ObjectStorage = new S3ObjectStorage({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  bucket: env.STORAGE_BUCKET,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
});
