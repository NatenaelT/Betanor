-- Objective, vacancy-specific shortlisting and structured-interview scorecards.
-- Scores are append-only reviewer records; the database recomputes the weighted
-- total and recommendation from the published vacancy rubric on every insert.

alter table public.job_openings
  add column if not exists shortlisting_rubric jsonb not null default $$[
    {"key":"essential_eligibility","label":"Essential eligibility and credentials","definition":"Evidence for qualifications, licences, and other essential requirements explicitly stated in this vacancy.","evidenceGuide":"Map each published essential requirement to the CV or application; note the section, credential, or answer that supports the rating.","weight":25,"gate":true},
    {"key":"relevant_experience","label":"Relevant experience and scope","definition":"Comparable work, responsibility level, context, and recency relevant to the advertised duties.","evidenceGuide":"Record the role, dates, scope, and specific duties or outcomes that match the published requirements.","weight":25,"gate":false},
    {"key":"role_capability","label":"Role-specific capability evidence","definition":"Demonstrated skills and capabilities explicitly required for this role, not general impressions.","evidenceGuide":"Cite a work sample, project, credential, or application response that demonstrates each rated capability.","weight":35,"gate":true},
    {"key":"evidence_of_outcomes","label":"Evidence of relevant outcomes","definition":"Specific, attributable results or deliverables that are relevant to the role.","evidenceGuide":"Note a result, deliverable, or impact stated by the candidate and where it appears in the application.","weight":15,"gate":false}
  ]$$::jsonb,
  add column if not exists interview_rubric jsonb not null default $$[
    {"key":"role_knowledge","label":"Role knowledge and practical judgment","definition":"Accuracy and application of knowledge required by the published role requirements.","evidenceGuide":"Ask the same pre-agreed job-knowledge questions of every candidate; record the answer and relevant technical facts.","weight":30,"gate":true},
    {"key":"problem_solving","label":"Applied problem-solving","definition":"Structured analysis, safe decisions, and workable actions in a role-relevant scenario.","evidenceGuide":"Use the same role-related scenario and time limit; record the steps, trade-offs, and result in the answer.","weight":30,"gate":true},
    {"key":"behavioral_evidence","label":"Behavioral evidence and results","definition":"Specific past actions and outcomes that demonstrate the competencies required for the role.","evidenceGuide":"Use the same competency-based prompt; capture the candidate's situation, action, and attributable result.","weight":25,"gate":false},
    {"key":"job_communication","label":"Job-relevant communication and collaboration","definition":"Ability to exchange accurate, understandable information needed for this role; do not rate accent, style, or personality similarity.","evidenceGuide":"Record a concrete example from the structured interview or job exercise showing role-relevant listening, explanation, or handover.","weight":15,"gate":false}
  ]$$::jsonb,
  add column if not exists shortlisting_threshold smallint not null default 70,
  add column if not exists interview_threshold smallint not null default 70;

alter table public.job_opening_templates
  add column if not exists shortlisting_rubric jsonb not null default $$[
    {"key":"essential_eligibility","label":"Essential eligibility and credentials","definition":"Evidence for qualifications, licences, and other essential requirements explicitly stated in this vacancy.","evidenceGuide":"Map each published essential requirement to the CV or application; note the section, credential, or answer that supports the rating.","weight":25,"gate":true},
    {"key":"relevant_experience","label":"Relevant experience and scope","definition":"Comparable work, responsibility level, context, and recency relevant to the advertised duties.","evidenceGuide":"Record the role, dates, scope, and specific duties or outcomes that match the published requirements.","weight":25,"gate":false},
    {"key":"role_capability","label":"Role-specific capability evidence","definition":"Demonstrated skills and capabilities explicitly required for this role, not general impressions.","evidenceGuide":"Cite a work sample, project, credential, or application response that demonstrates each rated capability.","weight":35,"gate":true},
    {"key":"evidence_of_outcomes","label":"Evidence of relevant outcomes","definition":"Specific, attributable results or deliverables that are relevant to the role.","evidenceGuide":"Note a result, deliverable, or impact stated by the candidate and where it appears in the application.","weight":15,"gate":false}
  ]$$::jsonb,
  add column if not exists interview_rubric jsonb not null default $$[
    {"key":"role_knowledge","label":"Role knowledge and practical judgment","definition":"Accuracy and application of knowledge required by the published role requirements.","evidenceGuide":"Ask the same pre-agreed job-knowledge questions of every candidate; record the answer and relevant technical facts.","weight":30,"gate":true},
    {"key":"problem_solving","label":"Applied problem-solving","definition":"Structured analysis, safe decisions, and workable actions in a role-relevant scenario.","evidenceGuide":"Use the same role-related scenario and time limit; record the steps, trade-offs, and result in the answer.","weight":30,"gate":true},
    {"key":"behavioral_evidence","label":"Behavioral evidence and results","definition":"Specific past actions and outcomes that demonstrate the competencies required for the role.","evidenceGuide":"Use the same competency-based prompt; capture the candidate's situation, action, and attributable result.","weight":25,"gate":false},
    {"key":"job_communication","label":"Job-relevant communication and collaboration","definition":"Ability to exchange accurate, understandable information needed for this role; do not rate accent, style, or personality similarity.","evidenceGuide":"Record a concrete example from the structured interview or job exercise showing role-relevant listening, explanation, or handover.","weight":15,"gate":false}
  ]$$::jsonb,
  add column if not exists shortlisting_threshold smallint not null default 70,
  add column if not exists interview_threshold smallint not null default 70;

alter table public.job_openings
  drop constraint if exists job_openings_shortlisting_rubric_check,
  drop constraint if exists job_openings_interview_rubric_check,
  drop constraint if exists job_openings_shortlisting_threshold_check,
  drop constraint if exists job_openings_interview_threshold_check;
alter table public.job_openings
  add constraint job_openings_shortlisting_rubric_check check (jsonb_typeof(shortlisting_rubric) = 'array' and jsonb_array_length(shortlisting_rubric) between 2 and 8),
  add constraint job_openings_interview_rubric_check check (jsonb_typeof(interview_rubric) = 'array' and jsonb_array_length(interview_rubric) between 2 and 8),
  add constraint job_openings_shortlisting_threshold_check check (shortlisting_threshold between 0 and 100),
  add constraint job_openings_interview_threshold_check check (interview_threshold between 0 and 100);

alter table public.job_opening_templates
  drop constraint if exists job_opening_templates_shortlisting_rubric_check,
  drop constraint if exists job_opening_templates_interview_rubric_check,
  drop constraint if exists job_opening_templates_shortlisting_threshold_check,
  drop constraint if exists job_opening_templates_interview_threshold_check;
alter table public.job_opening_templates
  add constraint job_opening_templates_shortlisting_rubric_check check (jsonb_typeof(shortlisting_rubric) = 'array' and jsonb_array_length(shortlisting_rubric) between 2 and 8),
  add constraint job_opening_templates_interview_rubric_check check (jsonb_typeof(interview_rubric) = 'array' and jsonb_array_length(interview_rubric) between 2 and 8),
  add constraint job_opening_templates_shortlisting_threshold_check check (shortlisting_threshold between 0 and 100),
  add constraint job_opening_templates_interview_threshold_check check (interview_threshold between 0 and 100);

create or replace function private.validate_recruitment_rubric_set()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rubric_index integer;
  selected_rubric jsonb;
  criterion jsonb;
  criterion_key text;
  weight_text text;
  weight_total integer;
  seen_keys text[];
begin
  if new.shortlisting_threshold not between 0 and 100 or new.interview_threshold not between 0 and 100 then
    raise exception 'Scoring thresholds must be whole percentages from 0 to 100.' using errcode = '22023';
  end if;
  for rubric_index in 1..2 loop
    selected_rubric := case when rubric_index = 1 then new.shortlisting_rubric else new.interview_rubric end;
    if jsonb_typeof(selected_rubric) is distinct from 'array' then
      raise exception 'Each recruitment stage must have between 2 and 8 criteria.' using errcode = '22023';
    end if;
    if jsonb_array_length(selected_rubric) not between 2 and 8 then
      raise exception 'Each recruitment stage must have between 2 and 8 criteria.' using errcode = '22023';
    end if;
    weight_total := 0;
    seen_keys := array[]::text[];
    for criterion in select value from jsonb_array_elements(selected_rubric) as rows(value) loop
      criterion_key := coalesce(criterion ->> 'key', '');
      weight_text := coalesce(criterion ->> 'weight', '');
      if jsonb_typeof(criterion) is distinct from 'object'
         or criterion_key !~ '^[a-z][a-z0-9_-]{1,39}$'
         or criterion_key = any(seen_keys)
         or coalesce(length(btrim(criterion ->> 'label')), 0) not between 1 and 120
         or coalesce(length(btrim(criterion ->> 'definition')), 0) not between 1 and 360
         or coalesce(length(btrim(criterion ->> 'evidenceGuide')), 0) not between 1 and 500
         or jsonb_typeof(criterion -> 'gate') is distinct from 'boolean'
         or weight_text !~ '^(100|[1-9][0-9]?)$' then
        raise exception 'A recruitment criterion is incomplete or invalid.' using errcode = '22023';
      end if;
      weight_total := weight_total + weight_text::integer;
      seen_keys := array_append(seen_keys, criterion_key);
    end loop;
    if weight_total <> 100 then
      raise exception 'Scoring criteria weights for each stage must total exactly 100 percent.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_recruitment_rubric_set() from public, anon, authenticated;
drop trigger if exists validate_job_opening_recruitment_rubrics on public.job_openings;
create trigger validate_job_opening_recruitment_rubrics
  before insert or update on public.job_openings
  for each row execute procedure private.validate_recruitment_rubric_set();
drop trigger if exists validate_job_opening_template_recruitment_rubrics on public.job_opening_templates;
create trigger validate_job_opening_template_recruitment_rubrics
  before insert or update on public.job_opening_templates
  for each row execute procedure private.validate_recruitment_rubric_set();

create or replace function private.lock_recruitment_rubric_after_applications()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.shortlisting_rubric, new.interview_rubric, new.shortlisting_threshold, new.interview_threshold)
       is distinct from
     (old.shortlisting_rubric, old.interview_rubric, old.shortlisting_threshold, old.interview_threshold)
     and exists (select 1 from public.job_applications application where application.job_opening_id = old.id) then
    raise exception 'Scoring rules are locked after the first application is received. Create a new vacancy to change them.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_recruitment_rubric_after_applications() from public, anon, authenticated;
drop trigger if exists lock_recruitment_rubric_after_applications on public.job_openings;
create trigger lock_recruitment_rubric_after_applications
  before update of shortlisting_rubric, interview_rubric, shortlisting_threshold, interview_threshold
  on public.job_openings
  for each row execute procedure private.lock_recruitment_rubric_after_applications();

create table if not exists public.job_application_evaluations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  stage text not null check (stage in ('shortlisting', 'interview')),
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  rubric_snapshot jsonb not null check (jsonb_typeof(rubric_snapshot) = 'array'),
  evaluation_items jsonb not null check (jsonb_typeof(evaluation_items) = 'array'),
  total_score numeric(5,2) not null check (total_score between 0 and 100),
  threshold_score smallint not null check (threshold_score between 0 and 100),
  recommendation text not null check (recommendation in ('meets_threshold', 'below_threshold', 'gate_not_met')),
  submitted_at timestamptz not null default now()
);

create index if not exists job_application_evaluations_latest_idx
  on public.job_application_evaluations (application_id, stage, submitted_at desc);
create index if not exists job_application_evaluations_reviewer_idx
  on public.job_application_evaluations (workspace_id, reviewer_id, submitted_at desc);

alter table public.job_application_evaluations enable row level security;
revoke all on public.job_application_evaluations from public, anon, authenticated;
grant select, insert on public.job_application_evaluations to authenticated;
drop policy if exists "Recruitment staff read application evaluations" on public.job_application_evaluations;
create policy "Recruitment staff read application evaluations"
  on public.job_application_evaluations for select to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)));
drop policy if exists "Recruitment staff submit own evaluations" on public.job_application_evaluations;
create policy "Recruitment staff submit own evaluations"
  on public.job_application_evaluations for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and (select private.has_permission('recruitment.manage', workspace_id))
  );

create or replace function private.validate_job_application_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_workspace uuid;
  target_stage text;
  target_shortlist_rubric jsonb;
  target_interview_rubric jsonb;
  target_shortlist_threshold smallint;
  target_interview_threshold smallint;
  selected_rubric jsonb;
  selected_threshold smallint;
  submitted_items jsonb := new.evaluation_items;
  canonical_items jsonb := '[]'::jsonb;
  criterion jsonb;
  item jsonb;
  criterion_key text;
  item_key text;
  rating_text text;
  rating integer;
  criterion_weight numeric;
  weight_total numeric := 0;
  score_total numeric := 0;
  evidence_text text;
  gate_failed boolean := false;
  seen_keys text[] := array[]::text[];
  item_count integer;
  i integer;
begin
  select opening.workspace_id, application.stage, opening.shortlisting_rubric, opening.interview_rubric,
         opening.shortlisting_threshold, opening.interview_threshold
    into target_workspace, target_stage, target_shortlist_rubric, target_interview_rubric,
         target_shortlist_threshold, target_interview_threshold
    from public.job_applications application
    join public.job_openings opening on opening.id = application.job_opening_id
    where application.id = new.application_id;

  if not found or target_workspace is distinct from new.workspace_id then
    raise exception 'The application is not in the evaluation workspace.' using errcode = '23514';
  end if;
  if new.reviewer_id is distinct from (select auth.uid()) then
    raise exception 'An evaluation must be submitted by its authenticated reviewer.' using errcode = '42501';
  end if;
  if new.stage = 'shortlisting' then
    if target_stage not in ('applied', 'screening', 'shortlisted') then
      raise exception 'This application is no longer in the shortlisting stage.' using errcode = '23514';
    end if;
    selected_rubric := target_shortlist_rubric;
    selected_threshold := target_shortlist_threshold;
  else
    if target_stage not in ('shortlisted', 'interview') then
      raise exception 'Complete shortlisting and advance the candidate before interview scoring.' using errcode = '23514';
    end if;
    selected_rubric := target_interview_rubric;
    selected_threshold := target_interview_threshold;
  end if;

  if jsonb_typeof(selected_rubric) is distinct from 'array' then
    raise exception 'Every published criterion must have exactly one rating and evidence record.' using errcode = '22023';
  end if;
  if jsonb_array_length(selected_rubric) not between 2 and 8
     or jsonb_typeof(submitted_items) is distinct from 'array' then
    raise exception 'Every published criterion must have exactly one rating and evidence record.' using errcode = '22023';
  end if;
  if jsonb_array_length(submitted_items) <> jsonb_array_length(selected_rubric) then
    raise exception 'Every published criterion must have exactly one rating and evidence record.' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(selected_rubric);
  for i in 0..item_count - 1 loop
    criterion := selected_rubric -> i;
    item := submitted_items -> i;
    criterion_key := coalesce(criterion ->> 'key', '');
    item_key := coalesce(item ->> 'criterion_key', '');
    rating_text := coalesce(item ->> 'rating', '');
    evidence_text := btrim(coalesce(item ->> 'evidence', ''));
    if jsonb_typeof(criterion) <> 'object' or jsonb_typeof(item) <> 'object'
       or criterion_key !~ '^[a-z][a-z0-9_-]{1,39}$'
       or criterion_key = any(seen_keys)
       or criterion_key <> item_key
       or coalesce(length(btrim(criterion ->> 'label')), 0) not between 1 and 120
       or coalesce(length(btrim(criterion ->> 'definition')), 0) not between 1 and 360
       or coalesce(length(btrim(criterion ->> 'evidenceGuide')), 0) not between 1 and 500
       or jsonb_typeof(criterion -> 'gate') is distinct from 'boolean'
       or rating_text !~ '^[0-5]$'
       or length(evidence_text) < 20 or length(evidence_text) > 1200 then
      raise exception 'A criterion, anchored rating, or evidence record is invalid.' using errcode = '22023';
    end if;
    if coalesce(criterion ->> 'weight', '') !~ '^(100|[1-9][0-9]?)$' then
      raise exception 'Each criterion weight must be a whole number from 1 to 100.' using errcode = '22023';
    end if;
    rating := rating_text::integer;
    criterion_weight := (criterion ->> 'weight')::numeric;
    weight_total := weight_total + criterion_weight;
    score_total := score_total + (rating::numeric / 5) * criterion_weight;
    if (criterion ->> 'gate')::boolean and rating < 3 then gate_failed := true; end if;
    seen_keys := array_append(seen_keys, criterion_key);
    canonical_items := canonical_items || jsonb_build_array(jsonb_build_object(
      'criterion_key', criterion_key,
      'label', btrim(criterion ->> 'label'),
      'rating', rating,
      'weight', criterion_weight,
      'evidence', evidence_text
    ));
  end loop;
  if weight_total <> 100 then
    raise exception 'The published scoring criteria weights must total exactly 100 percent.' using errcode = '23514';
  end if;

  new.rubric_snapshot := selected_rubric;
  new.evaluation_items := canonical_items;
  new.threshold_score := selected_threshold;
  new.total_score := round(score_total, 2);
  new.recommendation := case
    when gate_failed then 'gate_not_met'
    when score_total >= selected_threshold then 'meets_threshold'
    else 'below_threshold'
  end;
  new.submitted_at := now();
  return new;
end;
$$;
revoke all on function private.validate_job_application_evaluation() from public, anon, authenticated;
drop trigger if exists validate_job_application_evaluation_before_insert on public.job_application_evaluations;
create trigger validate_job_application_evaluation_before_insert
  before insert on public.job_application_evaluations
  for each row execute procedure private.validate_job_application_evaluation();

create or replace function private.recruitment_panel_passes(application_id_input uuid, stage_input text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  target_workspace uuid;
  target_rubric jsonb;
  target_threshold smallint;
  reviewer_count integer;
  panel_score numeric;
  criterion jsonb;
  criterion_average numeric;
begin
  if stage_input not in ('shortlisting', 'interview') then return false; end if;
  select opening.workspace_id,
         case when stage_input = 'shortlisting' then opening.shortlisting_rubric else opening.interview_rubric end,
         case when stage_input = 'shortlisting' then opening.shortlisting_threshold else opening.interview_threshold end
    into target_workspace, target_rubric, target_threshold
    from public.job_applications application
    join public.job_openings opening on opening.id = application.job_opening_id
    where application.id = application_id_input;
  if not found or not (select private.has_permission('recruitment.manage', target_workspace)) then return false; end if;

  select count(*), avg(latest.total_score) into reviewer_count, panel_score
    from (
      select distinct on (evaluation.reviewer_id) evaluation.reviewer_id, evaluation.total_score, evaluation.evaluation_items
      from public.job_application_evaluations evaluation
      where evaluation.application_id = application_id_input and evaluation.stage = stage_input
      order by evaluation.reviewer_id, evaluation.submitted_at desc
    ) latest;
  if reviewer_count = 0 or panel_score < target_threshold then return false; end if;

  for criterion in select value from jsonb_array_elements(target_rubric) as rows(value) loop
    if (criterion ->> 'gate')::boolean then
      select avg((score_item ->> 'rating')::numeric) into criterion_average
        from (
          select distinct on (evaluation.reviewer_id) evaluation.reviewer_id, evaluation.evaluation_items
          from public.job_application_evaluations evaluation
          where evaluation.application_id = application_id_input and evaluation.stage = stage_input
          order by evaluation.reviewer_id, evaluation.submitted_at desc
        ) latest
        cross join lateral jsonb_array_elements(latest.evaluation_items) as score_items(score_item)
        where score_item ->> 'criterion_key' = criterion ->> 'key';
      if criterion_average is null or criterion_average < 3 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.recruitment_panel_passes(uuid, text) from public, anon;
grant execute on function private.recruitment_panel_passes(uuid, text) to authenticated;

create or replace function private.enforce_recruitment_stage_progression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is not distinct from old.stage then return new; end if;

  if new.stage = 'shortlisted' and old.stage not in ('applied', 'screening', 'shortlisted') then
    raise exception 'Only an active applicant in screening can advance to shortlisting.' using errcode = '23514';
  end if;
  if new.stage = 'shortlisted' and not (select private.recruitment_panel_passes(old.id, 'shortlisting')) then
    raise exception 'A passing, evidence-complete shortlisting panel score is required.' using errcode = '23514';
  end if;

  if new.stage = 'interview' then
    if old.stage not in ('shortlisted', 'interview') then
      raise exception 'Only a shortlisted candidate can advance to interview.' using errcode = '23514';
    end if;
    if not (select private.recruitment_panel_passes(old.id, 'shortlisting')) then
      raise exception 'A passing shortlisting panel score is required before interview.' using errcode = '23514';
    end if;
  end if;

  if new.stage in ('offered', 'hired') then
    if old.stage not in ('interview', 'offered', 'hired') then
      raise exception 'Complete the interview stage before making an offer or hire.' using errcode = '23514';
    end if;
    if not (select private.recruitment_panel_passes(old.id, 'interview')) then
      raise exception 'A passing, evidence-complete interview panel score is required before an offer or hire.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_recruitment_stage_progression() from public, anon, authenticated;
drop trigger if exists enforce_recruitment_stage_progression_before_update on public.job_applications;
create trigger enforce_recruitment_stage_progression_before_update
  before update of stage on public.job_applications
  for each row execute procedure private.enforce_recruitment_stage_progression();

-- Retain any legacy single-score values for historical records, but prevent
-- new manual scalar scores from becoming an alternate selection path.
create or replace function private.prevent_manual_recruitment_scalar_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.score is not null then
    raise exception 'Use the evidence-based evaluation scorecard instead of a manual scalar score.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.score is distinct from old.score then
    raise exception 'Manual scalar scores are retired; use the evidence-based evaluation scorecard.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_manual_recruitment_scalar_score() from public, anon, authenticated;
drop trigger if exists prevent_manual_recruitment_scalar_score_insert on public.job_applications;
create trigger prevent_manual_recruitment_scalar_score_insert
  before insert on public.job_applications
  for each row execute procedure private.prevent_manual_recruitment_scalar_score();
drop trigger if exists prevent_manual_recruitment_scalar_score_update on public.job_applications;
create trigger prevent_manual_recruitment_scalar_score_update
  before update of score on public.job_applications
  for each row execute procedure private.prevent_manual_recruitment_scalar_score();
comment on column public.job_applications.score is 'Deprecated legacy score retained for historical records only. Current selection uses append-only, database-calculated job_application_evaluations.';

comment on table public.job_application_evaluations is 'Append-only, vacancy-rubric snapshots for evidence-based shortlisting and structured interviews.';
comment on column public.job_application_evaluations.total_score is 'Database-computed weighted score out of 100; not a digital signature or automatic hiring decision.';
