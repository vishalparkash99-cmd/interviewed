export type StorageAdapter = {
  upload: (path: string, buffer: Buffer, contentType?: string) => Promise<string>;
  download: (path: string) => Promise<Buffer>;
  delete: (path: string) => Promise<void>;
  getSignedUrl: (path: string, expiresIn?: number) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
};

export function createStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "s3") {
    return createS3Adapter();
  }

  return createLocalAdapter();
}

function createLocalAdapter(): StorageAdapter {
  const fs = require("fs");
  const path = require("path");
  const baseDir = process.env.STORAGE_BUCKET || "uploads";
  const uploadDir = path.resolve(process.cwd(), baseDir);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  function resolveSafePath(filePath: string): string {
    if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
      throw new Error("Invalid storage path");
    }
    const resolved = path.resolve(uploadDir, filePath);
    const relative = path.relative(uploadDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid storage path");
    }
    return resolved;
  }

  return {
    upload: async (filePath: string, buffer: Buffer): Promise<string> => {
      const fullPath = resolveSafePath(filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, buffer);
      return filePath;
    },
    download: async (filePath: string): Promise<Buffer> => {
      const fullPath = resolveSafePath(filePath);
      return fs.readFileSync(fullPath);
    },
    delete: async (filePath: string): Promise<void> => {
      const fullPath = resolveSafePath(filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    },
    getSignedUrl: async (filePath: string): Promise<string> => {
      return `/storage/${filePath}`;
    },
    exists: async (filePath: string): Promise<boolean> => {
      const fullPath = resolveSafePath(filePath);
      return fs.existsSync(fullPath);
    },
  };
}

function createS3Adapter(): StorageAdapter {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetSignedUrl } = require("@aws-sdk/client-s3");
  const { getSignedUrl: getS3SignedUrl } = require("@aws-sdk/s3-request-presigner");

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

  const bucket = process.env.STORAGE_BUCKET || "interviewed-uploads";

  return {
    upload: async (filePath: string, buffer: Buffer, contentType?: string): Promise<string> => {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: filePath,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      });
      await s3.send(command);
      return filePath;
    },
    download: async (filePath: string): Promise<Buffer> => {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: filePath,
      });
      const response = await s3.send(command);
      const body = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    delete: async (filePath: string): Promise<void> => {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: filePath,
      });
      await s3.send(command);
    },
    getSignedUrl: async (filePath: string, expiresIn = 3600): Promise<string> => {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: filePath,
      });
      return getS3SignedUrl(s3, command, { expiresIn });
    },
    exists: async (filePath: string): Promise<boolean> => {
      const { HeadObjectCommand } = require("@aws-sdk/client-s3");
      try {
        const command = new HeadObjectCommand({
          Bucket: bucket,
          Key: filePath,
        });
        await s3.send(command);
        return true;
      } catch {
        return false;
      }
    },
  };
}
