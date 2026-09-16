-- Avoid collisions when an administrator has already used a DEPT-/P### style
-- code manually. The sequence remains monotonic; the trigger simply advances
-- until the generated code is unique within its workspace.

create or replace function public.generate_department_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' or regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g') = '' then
    loop
      new.code := format('DEPT-%s', lpad(nextval('public.department_code_seq')::text, 3, '0'));
      exit when not exists (select 1 from public.departments d where d.workspace_id = new.workspace_id and d.code = new.code);
    end loop;
  else
    new.code := upper(regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g'));
  end if;
  return new;
end;
$$;

create or replace function public.generate_position_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare department_code text;
begin
  if new.department_id is null then
    raise exception 'A departmental position must be linked to a department.' using errcode = '23514';
  end if;
  select d.code into department_code from public.departments d where d.id = new.department_id and d.workspace_id = new.workspace_id;
  if department_code is null then
    raise exception 'The selected department does not belong to this workspace.' using errcode = '23503';
  end if;
  if new.code is null or btrim(new.code) = '' or regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g') = '' then
    loop
      new.code := format('%s-P%s', upper(regexp_replace(department_code, '[^A-Za-z0-9]', '', 'g')), lpad(nextval('public.position_code_seq')::text, 3, '0'));
      exit when not exists (select 1 from public.positions p where p.workspace_id = new.workspace_id and p.code = new.code);
    end loop;
  else
    new.code := upper(regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g'));
  end if;
  return new;
end;
$$;
