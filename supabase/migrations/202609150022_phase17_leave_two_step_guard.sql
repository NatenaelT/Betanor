-- Managers can only move a request to in_review; only HR can finalize approval.
drop policy if exists "manager and hr decide leave requests" on public.leave_requests;
create policy "manager and hr decide leave requests" on public.leave_requests for update to authenticated
  using ((select private.has_permission('leave.approve', private.leave_request_workspace(id)))
    and status in ('submitted', 'in_review')
    and ((select private.leave_request_is_manager(id)) or (select private.has_permission('hr.manage', private.leave_request_workspace(id)))))
  with check (
    ((select private.has_permission('hr.manage', private.leave_request_workspace(id))) and status in ('in_review', 'approved', 'rejected'))
    or ((select private.leave_request_is_manager(id)) and status in ('in_review', 'rejected'))
  );
