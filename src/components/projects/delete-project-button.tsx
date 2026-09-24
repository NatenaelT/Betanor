"use client";

import type { FormEvent } from "react";

import { deleteProject } from "@/app/workspace/projects/actions";
import { Button } from "@/components/ui/button";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Delete this project? Linked task history will be preserved without its project link, but milestones and project membership records will be removed.")) {
      event.preventDefault();
    }
  }

  return <form action={deleteProject} onSubmit={confirmDelete}>
    <input type="hidden" name="projectId" value={projectId}/>
    <Button type="submit" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50">Delete project</Button>
  </form>;
}
