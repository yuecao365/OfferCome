"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { deleteInterview } from "@/lib/interviews/actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      aria-label="删除面试记录"
      className="text-danger hover:bg-danger-soft hover:text-danger-strong"
      disabled={pending}
      size="icon"
      title="删除面试记录"
      type="submit"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" className="size-4" />
    </Button>
  );
}

export function InterviewDeleteButton({
  id,
  confirmMessage = "确定删除这条面试记录吗？",
  redirectTo,
}: {
  id: string;
  confirmMessage?: string;
  redirectTo?: "/interviews/mock";
}) {
  return (
    <form
      action={deleteInterview}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      {redirectTo ? (
        <input name="redirectTo" type="hidden" value={redirectTo} />
      ) : null}
      <DeleteButton />
    </form>
  );
}
