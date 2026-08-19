import { revalidatePath } from "next/cache";

/** Pages that render resumes or their internship/project records. */
const RESUME_DEPENDENT_PATHS = [
  "/resumes",
  "/interviews",
  "/interviews/history",
  "/interviews/review",
  "/applications",
];

export function revalidateResumeDependents(): void {
  for (const path of RESUME_DEPENDENT_PATHS) {
    revalidatePath(path);
  }
}
