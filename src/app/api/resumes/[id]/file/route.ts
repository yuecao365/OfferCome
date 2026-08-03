import fs from "node:fs/promises";

import { prisma } from "@/lib/db";
import { assertPathInsideResumeDir } from "@/lib/resumes/storage";

function isLocalRequest(request: Request): boolean {
  const host = request.headers.get("host") ?? "";
  return (
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:")
  );
}

function contentDisposition(originalName: string, download: boolean): string {
  const disposition = download ? "attachment" : "inline";
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalRequest(request)) {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const resume = await prisma.resume.findUnique({
    where: { id },
    select: {
      originalName: true,
      filePath: true,
      mimeType: true,
    },
  });

  if (!resume) {
    return Response.json({ message: "Resume not found" }, { status: 404 });
  }

  try {
    const safePath = assertPathInsideResumeDir(resume.filePath);
    const file = await fs.readFile(safePath);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": resume.mimeType,
        "Content-Disposition": contentDisposition(resume.originalName, download),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ message: "Resume file not found" }, { status: 404 });
  }
}
