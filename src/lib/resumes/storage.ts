import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const RESUME_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const RESUME_UPLOAD_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".local",
  "uploads",
  "resumes",
);
export const RESUME_TEMP_UPLOAD_DIR = path.join(RESUME_UPLOAD_DIR, ".tmp");

const ALLOWED_MIME_TYPES_BY_EXTENSION: Record<string, Set<string>> = {
  ".pdf": new Set(["application/pdf"]),
  ".doc": new Set(["application/msword", "application/octet-stream"]),
  ".docx": new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
  ]),
  ".jpg": new Set(["image/jpeg"]),
  ".jpeg": new Set(["image/jpeg"]),
  ".png": new Set(["image/png"]),
  ".webp": new Set(["image/webp"]),
};

const DEFAULT_MIME_TYPE_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

type ResumeUploadExtension = keyof typeof DEFAULT_MIME_TYPE_BY_EXTENSION;

export type ResumeUploadInput = {
  originalName: string;
  mimeType: string;
  fileSize: number;
};

export type ResumeUploadValidationResult =
  | { ok: true; extension: ResumeUploadExtension; normalizedMimeType: string }
  | { ok: false; message: string };

export type StoredResumeFile = {
  originalName: string;
  storedName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
};

export type TemporaryResumeFile = StoredResumeFile & {
  tempUploadId: string;
};

export function validateResumeUpload(
  input: ResumeUploadInput,
): ResumeUploadValidationResult {
  const originalName = input.originalName.trim();
  const extension = path.extname(originalName).toLowerCase();

  if (!originalName || !ALLOWED_MIME_TYPES_BY_EXTENSION[extension]) {
    return {
      ok: false,
      message: "只支持 PDF、DOC、DOCX、JPG、PNG、WebP 简历文件。",
    };
  }

  if (input.fileSize <= 0) {
    return { ok: false, message: "上传文件为空，请重新选择简历文件。" };
  }

  if (input.fileSize > RESUME_MAX_SIZE_BYTES) {
    return { ok: false, message: "单个简历文件不能超过 10MB。" };
  }

  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const allowedMimeTypes = ALLOWED_MIME_TYPES_BY_EXTENSION[extension];
  if (normalizedMimeType && !allowedMimeTypes.has(normalizedMimeType)) {
    return { ok: false, message: "文件类型和扩展名不匹配。" };
  }

  return {
    ok: true,
    extension: extension as ResumeUploadExtension,
    normalizedMimeType:
      normalizedMimeType ||
      DEFAULT_MIME_TYPE_BY_EXTENSION[extension as ResumeUploadExtension],
  };
}

export function assertPathInsideResumeDir(
  filePath: string,
  rootDir = RESUME_UPLOAD_DIR,
): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved resume path is outside the resume upload directory.");
  }

  return resolvedPath;
}

export function assertPathInsideResumeTempDir(filePath: string): string {
  return assertPathInsideResumeDir(filePath, RESUME_TEMP_UPLOAD_DIR);
}

export function buildStoredResumeName(extension: string): string {
  return `${Date.now()}-${crypto.randomUUID()}${extension}`;
}

export async function saveResumeFile(file: File): Promise<StoredResumeFile> {
  const validation = validateResumeUpload({
    originalName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const storedName = buildStoredResumeName(validation.extension);
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });

  const filePath = assertPathInsideResumeDir(
    path.join(RESUME_UPLOAD_DIR, storedName),
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes, { flag: "wx" });

  return {
    originalName: file.name,
    storedName,
    filePath,
    mimeType: validation.normalizedMimeType,
    fileSize: file.size,
  };
}

function metadataPathForTempUpload(tempUploadId: string): string {
  return assertPathInsideResumeTempDir(
    path.join(RESUME_TEMP_UPLOAD_DIR, `${tempUploadId}.json`),
  );
}

export async function saveTemporaryResumeFile(
  file: File,
): Promise<TemporaryResumeFile> {
  const validation = validateResumeUpload({
    originalName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const tempUploadId = crypto.randomUUID();
  const storedName = buildStoredResumeName(validation.extension);
  await fs.mkdir(RESUME_TEMP_UPLOAD_DIR, { recursive: true });

  const tempFilePath = assertPathInsideResumeTempDir(
    path.join(RESUME_TEMP_UPLOAD_DIR, `${tempUploadId}${validation.extension}`),
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tempFilePath, bytes, { flag: "wx" });

  const temporary: TemporaryResumeFile = {
    tempUploadId,
    originalName: file.name,
    storedName,
    filePath: tempFilePath,
    mimeType: validation.normalizedMimeType,
    fileSize: file.size,
  };
  await fs.writeFile(
    metadataPathForTempUpload(tempUploadId),
    JSON.stringify(temporary),
    { flag: "wx" },
  );

  return temporary;
}

export async function getTemporaryResumeFile(
  tempUploadId: string,
): Promise<TemporaryResumeFile> {
  if (!/^[a-f0-9-]+$/i.test(tempUploadId)) {
    throw new Error("Invalid temporary resume upload id.");
  }

  const raw = await fs.readFile(metadataPathForTempUpload(tempUploadId), "utf8");
  const parsed = JSON.parse(raw) as TemporaryResumeFile;
  return {
    ...parsed,
    filePath: assertPathInsideResumeTempDir(parsed.filePath),
  };
}

export async function promoteTemporaryResumeFile(
  tempUploadId: string,
): Promise<StoredResumeFile> {
  const temporary = await getTemporaryResumeFile(tempUploadId);
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });

  const finalPath = assertPathInsideResumeDir(
    path.join(RESUME_UPLOAD_DIR, temporary.storedName),
  );
  await fs.rename(temporary.filePath, finalPath);
  await fs.unlink(metadataPathForTempUpload(tempUploadId)).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  });

  return {
    originalName: temporary.originalName,
    storedName: temporary.storedName,
    filePath: finalPath,
    mimeType: temporary.mimeType,
    fileSize: temporary.fileSize,
  };
}

export async function discardTemporaryResumeFile(
  tempUploadId: string,
): Promise<void> {
  const temporary = await getTemporaryResumeFile(tempUploadId).catch(() => null);
  if (!temporary) {
    return;
  }

  await fs.unlink(temporary.filePath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  });
  await fs.unlink(metadataPathForTempUpload(tempUploadId)).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  });
}

export async function deleteStoredResumeFile(filePath: string): Promise<void> {
  const safePath = assertPathInsideResumeDir(filePath);
  try {
    await fs.unlink(safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
