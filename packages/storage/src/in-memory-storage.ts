import type { ObjectStorage } from "./storage";

/** In-memory ObjectStorage implementation for unit tests. */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async putObject(params: { key: string; body: Buffer | string }): Promise<void> {
    this.objects.set(
      params.key,
      typeof params.body === "string" ? Buffer.from(params.body) : params.body,
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`Object not found: ${key}`);
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
