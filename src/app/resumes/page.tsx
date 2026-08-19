import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ResumeList } from "@/components/resumes/resume-list";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { ResumeProjectsPanel } from "@/components/resumes/resume-projects-panel";
import { ResumeUploadModal } from "@/components/resumes/resume-upload-modal";
import { getResumeProjects, getResumes } from "@/lib/resumes/queries";
import { formatFileSize, resumeTypeLabel } from "@/lib/resumes/types";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
      <PageHeader
        actions={<ResumeUploadModal />}
        description="管理本地简历版本。PDF 和图片可直接预览，Word 文件可下载后查看。"
        eyebrow="求职管理"
        title="简历中心"
      />

      <section className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ResumeList resumes={resumes} selectedId={selectedResume?.id ?? null} />

        {selectedResume ? (
          <ResumePreview
            downloadUrl={selectedResume.downloadUrl}
            key={selectedResume.id}
            name={selectedResume.originalName}
            previewKind={selectedResume.previewKind}
            previewUrl={selectedResume.previewUrl}
            sizeLabel={formatFileSize(selectedResume.fileSize)}
            typeLabel={resumeTypeLabel(selectedResume.mimeType, selectedResume.originalName)}
          />
        ) : null}
      </section>

      <ResumeProjectsPanel projects={resumeProjects} />
    </AppShell>
  );
}
