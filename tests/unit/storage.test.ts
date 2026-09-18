import { createStorageAdapter } from "../../packages/storage/src/local";
import fs from "fs";
import path from "path";

const TEST_DIR = path.resolve(__dirname, "../.test-uploads");

beforeAll(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("LocalStorageAdapter", () => {
  let adapter: ReturnType<typeof createStorageAdapter>;

  beforeAll(() => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.STORAGE_BUCKET = TEST_DIR;
    adapter = createStorageAdapter();
  });

  it("uploads a file and returns the path", async () => {
    const result = await adapter.upload("test/file.txt", Buffer.from("hello world"), "text/plain");
    expect(result).toBe("test/file.txt");
    expect(fs.existsSync(path.join(TEST_DIR, "test/file.txt"))).toBe(true);
  });

  it("downloads a previously uploaded file", async () => {
    const buffer = await adapter.download("test/file.txt");
    expect(buffer.toString()).toBe("hello world");
  });

  it("checks file existence", async () => {
    expect(await adapter.exists("test/file.txt")).toBe(true);
    expect(await adapter.exists("test/nonexistent.txt")).toBe(false);
  });

  it("generates a signed URL (local returns /storage/ prefix)", async () => {
    const url = await adapter.getSignedUrl("test/file.txt");
    expect(url).toContain("/storage/");
    expect(url).toContain("test/file.txt");
  });

  it("deletes a file", async () => {
    await adapter.delete("test/file.txt");
    expect(await adapter.exists("test/file.txt")).toBe(false);
  });

  it("creates directories on upload", async () => {
    await adapter.upload("deep/nested/dir/file.txt", Buffer.from("nested"), "text/plain");
    expect(await adapter.exists("deep/nested/dir/file.txt")).toBe(true);
    await adapter.delete("deep/nested/dir/file.txt");
  });

  it("rejects paths that escape the upload directory (traversal)", async () => {
    await expect(adapter.upload("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.upload("../../../../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.download("../etc/passwd")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.exists("..")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.delete("../nope.txt")).rejects.toThrow(/Invalid storage path/);
  });

  it("rejects absolute and null-byte paths", async () => {
    await expect(adapter.upload("/etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.upload("file\u0000.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
  });

  it("rejects empty or non-string paths", async () => {
    await expect(adapter.upload("", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
    await expect(adapter.upload(null as any, Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
  });
});
