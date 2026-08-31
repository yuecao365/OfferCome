import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { ResumeUploadModal } from "@/components/resumes/resume-upload-modal";
import { ResumesView } from "@/components/resumes/resumes-view";
import { TrialResumesPage } from "@/components/trial/pages/trial-resumes-page";
import { getResumeProjects, getResumes } from "@/lib/resumes/queries";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";
import { isTrialMode } from "@/lib/runtime-mode";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isTrialMode()) {
    return (
      <AppShell active="resumes">
        <TrialResumesPage />
      </AppShell>
    );
  }

  await connection();

  const [params, resumes, resumeProjects] = await Promise.all([
    searchParams,
    getResumes(),
    getResumeProjects(),
  ]);
  const previewParam = Array.isArray(params.preview)
    ? params.preview[0]
    : params.preview;
  const selectedResume =
    resumes.find((resume) => resume.id === previewParam) ?? resumes[0] ?? null;

  return (
    <AppShell active="resumes">
      <ResumesView
        description="管理本地简历版本。PDF 和图片可直接预览，Word 文件可下载后查看。"
        preview={
          selectedResume ? (
            <ResumePreview
              downloadUrl={selectedResume.downloadUrl}
              key={selectedResume.id}
              name={selectedResume.originalName}
              previewKind={selectedResume.previewKind}
              previewUrl={selectedResume.previewUrl}
              sizeLabel={formatFileSize(selectedResume.fileSize)}
              typeLabel={resumeTypeLabel(selectedResume.mimeType, selectedResume.originalName)}
            />
          ) : null
        }
        projects={resumeProjects}
        resumes={resumes}
        selectedId={selectedResume?.id ?? null}
        uploadModal={<ResumeUploadModal />}
      />
    </AppShell>
  );
}
