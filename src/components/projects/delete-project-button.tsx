"use client";

import { deleteProject } from "@/app/workspace/projects/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const { confirm } = useAppDialog();
  async function confirmDelete() {
    const approved = await confirm({ title: "Delete project?", description: "Linked task history will be preserved without its project link, but milestones and project membership records will be removed.", confirmLabel: "Delete project", destructive: true });
    if (!approved) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    await deleteProject(formData);
  }

  return <Button type="button" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void confirmDelete()}>Delete project</Button>;
}
