drop extension if exists "pg_net";

create sequence "public"."master_machines_id_seq";

create sequence "public"."master_problems_id_seq";

create sequence "public"."system_logs_id_seq";


  create table "public"."daily_waste_reports" (
    "id" uuid not null default gen_random_uuid(),
    "report_date" date not null default CURRENT_DATE,
    "shift" text,
    "department_code" text not null default 'blow'::text,
    "product_name" text,
    "machine_no" text,
    "total_qty" numeric default 0,
    "good_qty" numeric default 0,
    "waste_qty" numeric default 0,
    "unit" text default 'kg'::text,
    "unit_cost" numeric default 0,
    "reason_id" uuid,
    "reason_detail" text,
    "forecast_note" text,
    "corrective_action" text,
    "note" text,
    "status" text not null default 'pending'::text,
    "created_by" uuid,
    "checked_by" uuid,
    "checked_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "department" text default 'blow'::text,
    "work_shift" text,
    "incident_datetime" timestamp with time zone default now(),
    "problem_type" text,
    "detail" text,
    "waste_weight_kg" numeric default 0,
    "reported_by" text,
    "resolution" text,
    "resolver" text,
    "submitted_by" uuid,
    "submitted_at" timestamp with time zone default now(),
    "checked_by_name" text,
    "supervisor_note" text,
    "other_problem_detail" text
      );


alter table "public"."daily_waste_reports" enable row level security;


  create table "public"."department_qr_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "department_code" text not null,
    "token" text not null,
    "status" text not null default 'active'::text,
    "created_at" timestamp with time zone default now(),
    "department" text,
    "department_name" text,
    "email" text,
    "username" text,
    "display_name" text,
    "role" text default 'staff_qr'::text
      );


alter table "public"."department_qr_tokens" enable row level security;


  create table "public"."departments" (
    "code" text not null,
    "name_th" text not null,
    "sort_order" integer default 0,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "max_waste_percent" numeric(6,2) not null default 3.00,
    "warning_percent" numeric(6,2) not null default 2.50,
    "theme_color" character varying(20) default '#2563eb'::character varying
      );


alter table "public"."departments" enable row level security;


  create table "public"."master_departments" (
    "id" uuid not null default gen_random_uuid(),
    "department_code" text not null,
    "department_name" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "sort_order" integer default 0,
    "max_waste_percent" numeric(6,2) not null default 3.00,
    "warning_percent" numeric(6,2) not null default 2.50,
    "theme_color" character varying(20) default '#2563eb'::character varying
      );



  create table "public"."master_machines" (
    "id" bigint not null default nextval('public.master_machines_id_seq'::regclass),
    "machine_no" text not null,
    "department" text not null default 'blow'::text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "sort_order" integer default 0
      );



  create table "public"."master_problems" (
    "id" bigint not null default nextval('public.master_problems_id_seq'::regclass),
    "problem_type" text not null,
    "department" text not null default 'blow'::text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "sort_order" integer default 0
      );



  create table "public"."master_shifts" (
    "id" uuid not null default gen_random_uuid(),
    "shift_name" text not null,
    "shift_time" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "sort_order" integer default 0
      );



  create table "public"."profiles" (
    "id" uuid not null default gen_random_uuid(),
    "username" text not null,
    "password" text not null,
    "role" text not null,
    "department" text,
    "created_at" timestamp with time zone default now(),
    "email" text,
    "display_name" text,
    "full_name" text,
    "department_code" text,
    "status" text default 'active'::text,
    "Note" text,
    "is_system_owner" boolean default false
      );



  create table "public"."system_logs" (
    "id" bigint not null default nextval('public.system_logs_id_seq'::regclass),
    "error_code" text,
    "error_message" text,
    "error_details" text,
    "user_id" text,
    "created_at" timestamp with time zone default now(),
    "status" text default 'unresolved'::text
      );


alter table "public"."system_logs" enable row level security;


  create table "public"."user_activity_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" text,
    "username" text,
    "display_name" text,
    "role" text,
    "department_code" text,
    "login_type" text,
    "action" text,
    "page_path" text,
    "page_title" text,
    "device_type" text,
    "browser" text,
    "platform" text,
    "screen_size" text,
    "user_agent" text,
    "note" text,
    "ref_table" text,
    "ref_id" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_activity_logs" enable row level security;


  create table "public"."user_departments" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "department_code" text not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."waste_reasons" (
    "id" uuid not null default gen_random_uuid(),
    "reason_name" text not null,
    "reason_group" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."waste_reasons" enable row level security;


  create table "public"."waste_standards" (
    "id" uuid not null default gen_random_uuid(),
    "department_code" text not null,
    "department_name" text not null,
    "max_waste_percent" numeric(6,2) not null default 3.00,
    "is_active" boolean not null default true,
    "updated_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "sort_order" integer default 0,
    "created_by" uuid
      );


alter table "public"."waste_standards" enable row level security;

alter sequence "public"."master_machines_id_seq" owned by "public"."master_machines"."id";

alter sequence "public"."master_problems_id_seq" owned by "public"."master_problems"."id";

alter sequence "public"."system_logs_id_seq" owned by "public"."system_logs"."id";

CREATE UNIQUE INDEX daily_waste_reports_pkey ON public.daily_waste_reports USING btree (id);

CREATE UNIQUE INDEX department_qr_tokens_pkey ON public.department_qr_tokens USING btree (id);

CREATE UNIQUE INDEX department_qr_tokens_token_key ON public.department_qr_tokens USING btree (token);

CREATE UNIQUE INDEX departments_pkey ON public.departments USING btree (code);

CREATE UNIQUE INDEX master_departments_department_code_key ON public.master_departments USING btree (department_code);

CREATE UNIQUE INDEX master_departments_department_code_unique ON public.master_departments USING btree (department_code);

CREATE UNIQUE INDEX master_departments_pkey ON public.master_departments USING btree (id);

CREATE UNIQUE INDEX master_machines_pkey ON public.master_machines USING btree (id);

CREATE UNIQUE INDEX master_problems_pkey ON public.master_problems USING btree (id);

CREATE UNIQUE INDEX master_shifts_pkey ON public.master_shifts USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);

CREATE UNIQUE INDEX system_logs_pkey ON public.system_logs USING btree (id);

CREATE UNIQUE INDEX user_activity_logs_pkey ON public.user_activity_logs USING btree (id);

CREATE UNIQUE INDEX user_departments_pkey ON public.user_departments USING btree (id);

CREATE UNIQUE INDEX user_departments_user_id_department_code_key ON public.user_departments USING btree (user_id, department_code);

CREATE UNIQUE INDEX waste_reasons_pkey ON public.waste_reasons USING btree (id);

CREATE UNIQUE INDEX waste_standards_department_code_key ON public.waste_standards USING btree (department_code);

CREATE UNIQUE INDEX waste_standards_pkey ON public.waste_standards USING btree (id);

alter table "public"."daily_waste_reports" add constraint "daily_waste_reports_pkey" PRIMARY KEY using index "daily_waste_reports_pkey";

alter table "public"."department_qr_tokens" add constraint "department_qr_tokens_pkey" PRIMARY KEY using index "department_qr_tokens_pkey";

alter table "public"."departments" add constraint "departments_pkey" PRIMARY KEY using index "departments_pkey";

alter table "public"."master_departments" add constraint "master_departments_pkey" PRIMARY KEY using index "master_departments_pkey";

alter table "public"."master_machines" add constraint "master_machines_pkey" PRIMARY KEY using index "master_machines_pkey";

alter table "public"."master_problems" add constraint "master_problems_pkey" PRIMARY KEY using index "master_problems_pkey";

alter table "public"."master_shifts" add constraint "master_shifts_pkey" PRIMARY KEY using index "master_shifts_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."system_logs" add constraint "system_logs_pkey" PRIMARY KEY using index "system_logs_pkey";

alter table "public"."user_activity_logs" add constraint "user_activity_logs_pkey" PRIMARY KEY using index "user_activity_logs_pkey";

alter table "public"."user_departments" add constraint "user_departments_pkey" PRIMARY KEY using index "user_departments_pkey";

alter table "public"."waste_reasons" add constraint "waste_reasons_pkey" PRIMARY KEY using index "waste_reasons_pkey";

alter table "public"."waste_standards" add constraint "waste_standards_pkey" PRIMARY KEY using index "waste_standards_pkey";

alter table "public"."daily_waste_reports" add constraint "chk_waste_qty_positive" CHECK ((waste_qty >= (0)::numeric)) not valid;

alter table "public"."daily_waste_reports" validate constraint "chk_waste_qty_positive";

alter table "public"."daily_waste_reports" add constraint "chk_waste_weight_positive" CHECK ((waste_weight_kg >= (0)::numeric)) not valid;

alter table "public"."daily_waste_reports" validate constraint "chk_waste_weight_positive";

alter table "public"."daily_waste_reports" add constraint "daily_waste_reports_department_code_fkey" FOREIGN KEY (department_code) REFERENCES public.master_departments(department_code) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."daily_waste_reports" validate constraint "daily_waste_reports_department_code_fkey";

alter table "public"."daily_waste_reports" add constraint "daily_waste_reports_reason_id_fkey" FOREIGN KEY (reason_id) REFERENCES public.waste_reasons(id) not valid;

alter table "public"."daily_waste_reports" validate constraint "daily_waste_reports_reason_id_fkey";

alter table "public"."department_qr_tokens" add constraint "department_qr_tokens_department_code_fkey" FOREIGN KEY (department_code) REFERENCES public.departments(code) not valid;

alter table "public"."department_qr_tokens" validate constraint "department_qr_tokens_department_code_fkey";

alter table "public"."department_qr_tokens" add constraint "department_qr_tokens_token_key" UNIQUE using index "department_qr_tokens_token_key";

alter table "public"."master_departments" add constraint "master_departments_department_code_key" UNIQUE using index "master_departments_department_code_key";

alter table "public"."master_departments" add constraint "master_departments_department_code_unique" UNIQUE using index "master_departments_department_code_unique";

alter table "public"."profiles" add constraint "profiles_department_code_fkey" FOREIGN KEY (department_code) REFERENCES public.master_departments(department_code) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_department_code_fkey";

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE using index "profiles_username_key";

alter table "public"."user_departments" add constraint "user_departments_department_code_fkey" FOREIGN KEY (department_code) REFERENCES public.master_departments(department_code) not valid;

alter table "public"."user_departments" validate constraint "user_departments_department_code_fkey";

alter table "public"."user_departments" add constraint "user_departments_user_id_department_code_key" UNIQUE using index "user_departments_user_id_department_code_key";

alter table "public"."user_departments" add constraint "user_departments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_departments" validate constraint "user_departments_user_id_fkey";

alter table "public"."waste_standards" add constraint "waste_standards_department_code_key" UNIQUE using index "waste_standards_department_code_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and lower(role) = 'admin'
      and lower(coalesce(status, 'active')) = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."daily_waste_reports" to "anon";

grant insert on table "public"."daily_waste_reports" to "anon";

grant references on table "public"."daily_waste_reports" to "anon";

grant select on table "public"."daily_waste_reports" to "anon";

grant trigger on table "public"."daily_waste_reports" to "anon";

grant truncate on table "public"."daily_waste_reports" to "anon";

grant update on table "public"."daily_waste_reports" to "anon";

grant delete on table "public"."daily_waste_reports" to "authenticated";

grant insert on table "public"."daily_waste_reports" to "authenticated";

grant references on table "public"."daily_waste_reports" to "authenticated";

grant select on table "public"."daily_waste_reports" to "authenticated";

grant trigger on table "public"."daily_waste_reports" to "authenticated";

grant truncate on table "public"."daily_waste_reports" to "authenticated";

grant update on table "public"."daily_waste_reports" to "authenticated";

grant delete on table "public"."daily_waste_reports" to "service_role";

grant insert on table "public"."daily_waste_reports" to "service_role";

grant references on table "public"."daily_waste_reports" to "service_role";

grant select on table "public"."daily_waste_reports" to "service_role";

grant trigger on table "public"."daily_waste_reports" to "service_role";

grant truncate on table "public"."daily_waste_reports" to "service_role";

grant update on table "public"."daily_waste_reports" to "service_role";

grant delete on table "public"."department_qr_tokens" to "anon";

grant insert on table "public"."department_qr_tokens" to "anon";

grant references on table "public"."department_qr_tokens" to "anon";

grant select on table "public"."department_qr_tokens" to "anon";

grant trigger on table "public"."department_qr_tokens" to "anon";

grant truncate on table "public"."department_qr_tokens" to "anon";

grant update on table "public"."department_qr_tokens" to "anon";

grant delete on table "public"."department_qr_tokens" to "authenticated";

grant insert on table "public"."department_qr_tokens" to "authenticated";

grant references on table "public"."department_qr_tokens" to "authenticated";

grant select on table "public"."department_qr_tokens" to "authenticated";

grant trigger on table "public"."department_qr_tokens" to "authenticated";

grant truncate on table "public"."department_qr_tokens" to "authenticated";

grant update on table "public"."department_qr_tokens" to "authenticated";

grant delete on table "public"."department_qr_tokens" to "service_role";

grant insert on table "public"."department_qr_tokens" to "service_role";

grant references on table "public"."department_qr_tokens" to "service_role";

grant select on table "public"."department_qr_tokens" to "service_role";

grant trigger on table "public"."department_qr_tokens" to "service_role";

grant truncate on table "public"."department_qr_tokens" to "service_role";

grant update on table "public"."department_qr_tokens" to "service_role";

grant delete on table "public"."departments" to "anon";

grant insert on table "public"."departments" to "anon";

grant references on table "public"."departments" to "anon";

grant select on table "public"."departments" to "anon";

grant trigger on table "public"."departments" to "anon";

grant truncate on table "public"."departments" to "anon";

grant update on table "public"."departments" to "anon";

grant delete on table "public"."departments" to "authenticated";

grant insert on table "public"."departments" to "authenticated";

grant references on table "public"."departments" to "authenticated";

grant select on table "public"."departments" to "authenticated";

grant trigger on table "public"."departments" to "authenticated";

grant truncate on table "public"."departments" to "authenticated";

grant update on table "public"."departments" to "authenticated";

grant delete on table "public"."departments" to "service_role";

grant insert on table "public"."departments" to "service_role";

grant references on table "public"."departments" to "service_role";

grant select on table "public"."departments" to "service_role";

grant trigger on table "public"."departments" to "service_role";

grant truncate on table "public"."departments" to "service_role";

grant update on table "public"."departments" to "service_role";

grant delete on table "public"."master_departments" to "anon";

grant insert on table "public"."master_departments" to "anon";

grant references on table "public"."master_departments" to "anon";

grant select on table "public"."master_departments" to "anon";

grant trigger on table "public"."master_departments" to "anon";

grant truncate on table "public"."master_departments" to "anon";

grant update on table "public"."master_departments" to "anon";

grant delete on table "public"."master_departments" to "authenticated";

grant insert on table "public"."master_departments" to "authenticated";

grant references on table "public"."master_departments" to "authenticated";

grant select on table "public"."master_departments" to "authenticated";

grant trigger on table "public"."master_departments" to "authenticated";

grant truncate on table "public"."master_departments" to "authenticated";

grant update on table "public"."master_departments" to "authenticated";

grant delete on table "public"."master_departments" to "service_role";

grant insert on table "public"."master_departments" to "service_role";

grant references on table "public"."master_departments" to "service_role";

grant select on table "public"."master_departments" to "service_role";

grant trigger on table "public"."master_departments" to "service_role";

grant truncate on table "public"."master_departments" to "service_role";

grant update on table "public"."master_departments" to "service_role";

grant delete on table "public"."master_machines" to "anon";

grant insert on table "public"."master_machines" to "anon";

grant references on table "public"."master_machines" to "anon";

grant select on table "public"."master_machines" to "anon";

grant trigger on table "public"."master_machines" to "anon";

grant truncate on table "public"."master_machines" to "anon";

grant update on table "public"."master_machines" to "anon";

grant delete on table "public"."master_machines" to "authenticated";

grant insert on table "public"."master_machines" to "authenticated";

grant references on table "public"."master_machines" to "authenticated";

grant select on table "public"."master_machines" to "authenticated";

grant trigger on table "public"."master_machines" to "authenticated";

grant truncate on table "public"."master_machines" to "authenticated";

grant update on table "public"."master_machines" to "authenticated";

grant delete on table "public"."master_machines" to "service_role";

grant insert on table "public"."master_machines" to "service_role";

grant references on table "public"."master_machines" to "service_role";

grant select on table "public"."master_machines" to "service_role";

grant trigger on table "public"."master_machines" to "service_role";

grant truncate on table "public"."master_machines" to "service_role";

grant update on table "public"."master_machines" to "service_role";

grant delete on table "public"."master_problems" to "anon";

grant insert on table "public"."master_problems" to "anon";

grant references on table "public"."master_problems" to "anon";

grant select on table "public"."master_problems" to "anon";

grant trigger on table "public"."master_problems" to "anon";

grant truncate on table "public"."master_problems" to "anon";

grant update on table "public"."master_problems" to "anon";

grant delete on table "public"."master_problems" to "authenticated";

grant insert on table "public"."master_problems" to "authenticated";

grant references on table "public"."master_problems" to "authenticated";

grant select on table "public"."master_problems" to "authenticated";

grant trigger on table "public"."master_problems" to "authenticated";

grant truncate on table "public"."master_problems" to "authenticated";

grant update on table "public"."master_problems" to "authenticated";

grant delete on table "public"."master_problems" to "service_role";

grant insert on table "public"."master_problems" to "service_role";

grant references on table "public"."master_problems" to "service_role";

grant select on table "public"."master_problems" to "service_role";

grant trigger on table "public"."master_problems" to "service_role";

grant truncate on table "public"."master_problems" to "service_role";

grant update on table "public"."master_problems" to "service_role";

grant delete on table "public"."master_shifts" to "anon";

grant insert on table "public"."master_shifts" to "anon";

grant references on table "public"."master_shifts" to "anon";

grant select on table "public"."master_shifts" to "anon";

grant trigger on table "public"."master_shifts" to "anon";

grant truncate on table "public"."master_shifts" to "anon";

grant update on table "public"."master_shifts" to "anon";

grant delete on table "public"."master_shifts" to "authenticated";

grant insert on table "public"."master_shifts" to "authenticated";

grant references on table "public"."master_shifts" to "authenticated";

grant select on table "public"."master_shifts" to "authenticated";

grant trigger on table "public"."master_shifts" to "authenticated";

grant truncate on table "public"."master_shifts" to "authenticated";

grant update on table "public"."master_shifts" to "authenticated";

grant delete on table "public"."master_shifts" to "service_role";

grant insert on table "public"."master_shifts" to "service_role";

grant references on table "public"."master_shifts" to "service_role";

grant select on table "public"."master_shifts" to "service_role";

grant trigger on table "public"."master_shifts" to "service_role";

grant truncate on table "public"."master_shifts" to "service_role";

grant update on table "public"."master_shifts" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."system_logs" to "anon";

grant insert on table "public"."system_logs" to "anon";

grant references on table "public"."system_logs" to "anon";

grant select on table "public"."system_logs" to "anon";

grant trigger on table "public"."system_logs" to "anon";

grant truncate on table "public"."system_logs" to "anon";

grant update on table "public"."system_logs" to "anon";

grant delete on table "public"."system_logs" to "authenticated";

grant insert on table "public"."system_logs" to "authenticated";

grant references on table "public"."system_logs" to "authenticated";

grant select on table "public"."system_logs" to "authenticated";

grant trigger on table "public"."system_logs" to "authenticated";

grant truncate on table "public"."system_logs" to "authenticated";

grant update on table "public"."system_logs" to "authenticated";

grant delete on table "public"."system_logs" to "service_role";

grant insert on table "public"."system_logs" to "service_role";

grant references on table "public"."system_logs" to "service_role";

grant select on table "public"."system_logs" to "service_role";

grant trigger on table "public"."system_logs" to "service_role";

grant truncate on table "public"."system_logs" to "service_role";

grant update on table "public"."system_logs" to "service_role";

grant delete on table "public"."user_activity_logs" to "anon";

grant insert on table "public"."user_activity_logs" to "anon";

grant references on table "public"."user_activity_logs" to "anon";

grant select on table "public"."user_activity_logs" to "anon";

grant trigger on table "public"."user_activity_logs" to "anon";

grant truncate on table "public"."user_activity_logs" to "anon";

grant update on table "public"."user_activity_logs" to "anon";

grant delete on table "public"."user_activity_logs" to "authenticated";

grant insert on table "public"."user_activity_logs" to "authenticated";

grant references on table "public"."user_activity_logs" to "authenticated";

grant select on table "public"."user_activity_logs" to "authenticated";

grant trigger on table "public"."user_activity_logs" to "authenticated";

grant truncate on table "public"."user_activity_logs" to "authenticated";

grant update on table "public"."user_activity_logs" to "authenticated";

grant delete on table "public"."user_activity_logs" to "service_role";

grant insert on table "public"."user_activity_logs" to "service_role";

grant references on table "public"."user_activity_logs" to "service_role";

grant select on table "public"."user_activity_logs" to "service_role";

grant trigger on table "public"."user_activity_logs" to "service_role";

grant truncate on table "public"."user_activity_logs" to "service_role";

grant update on table "public"."user_activity_logs" to "service_role";

grant delete on table "public"."user_departments" to "anon";

grant insert on table "public"."user_departments" to "anon";

grant references on table "public"."user_departments" to "anon";

grant select on table "public"."user_departments" to "anon";

grant trigger on table "public"."user_departments" to "anon";

grant truncate on table "public"."user_departments" to "anon";

grant update on table "public"."user_departments" to "anon";

grant delete on table "public"."user_departments" to "authenticated";

grant insert on table "public"."user_departments" to "authenticated";

grant references on table "public"."user_departments" to "authenticated";

grant select on table "public"."user_departments" to "authenticated";

grant trigger on table "public"."user_departments" to "authenticated";

grant truncate on table "public"."user_departments" to "authenticated";

grant update on table "public"."user_departments" to "authenticated";

grant delete on table "public"."user_departments" to "service_role";

grant insert on table "public"."user_departments" to "service_role";

grant references on table "public"."user_departments" to "service_role";

grant select on table "public"."user_departments" to "service_role";

grant trigger on table "public"."user_departments" to "service_role";

grant truncate on table "public"."user_departments" to "service_role";

grant update on table "public"."user_departments" to "service_role";

grant delete on table "public"."waste_reasons" to "anon";

grant insert on table "public"."waste_reasons" to "anon";

grant references on table "public"."waste_reasons" to "anon";

grant select on table "public"."waste_reasons" to "anon";

grant trigger on table "public"."waste_reasons" to "anon";

grant truncate on table "public"."waste_reasons" to "anon";

grant update on table "public"."waste_reasons" to "anon";

grant delete on table "public"."waste_reasons" to "authenticated";

grant insert on table "public"."waste_reasons" to "authenticated";

grant references on table "public"."waste_reasons" to "authenticated";

grant select on table "public"."waste_reasons" to "authenticated";

grant trigger on table "public"."waste_reasons" to "authenticated";

grant truncate on table "public"."waste_reasons" to "authenticated";

grant update on table "public"."waste_reasons" to "authenticated";

grant delete on table "public"."waste_reasons" to "service_role";

grant insert on table "public"."waste_reasons" to "service_role";

grant references on table "public"."waste_reasons" to "service_role";

grant select on table "public"."waste_reasons" to "service_role";

grant trigger on table "public"."waste_reasons" to "service_role";

grant truncate on table "public"."waste_reasons" to "service_role";

grant update on table "public"."waste_reasons" to "service_role";

grant delete on table "public"."waste_standards" to "anon";

grant insert on table "public"."waste_standards" to "anon";

grant references on table "public"."waste_standards" to "anon";

grant select on table "public"."waste_standards" to "anon";

grant trigger on table "public"."waste_standards" to "anon";

grant truncate on table "public"."waste_standards" to "anon";

grant update on table "public"."waste_standards" to "anon";

grant delete on table "public"."waste_standards" to "authenticated";

grant insert on table "public"."waste_standards" to "authenticated";

grant references on table "public"."waste_standards" to "authenticated";

grant select on table "public"."waste_standards" to "authenticated";

grant trigger on table "public"."waste_standards" to "authenticated";

grant truncate on table "public"."waste_standards" to "authenticated";

grant update on table "public"."waste_standards" to "authenticated";

grant delete on table "public"."waste_standards" to "service_role";

grant insert on table "public"."waste_standards" to "service_role";

grant references on table "public"."waste_standards" to "service_role";

grant select on table "public"."waste_standards" to "service_role";

grant trigger on table "public"."waste_standards" to "service_role";

grant truncate on table "public"."waste_standards" to "service_role";

grant update on table "public"."waste_standards" to "service_role";


  create policy "Allow All for Web"
  on "public"."daily_waste_reports"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "admin_all_daily_waste_reports"
  on "public"."daily_waste_reports"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "read daily waste reports"
  on "public"."daily_waste_reports"
  as permissive
  for select
  to public
using (true);



  create policy "read active qr tokens"
  on "public"."department_qr_tokens"
  as permissive
  for select
  to public
using ((status = 'active'::text));



  create policy "read departments"
  on "public"."departments"
  as permissive
  for select
  to public
using (true);



  create policy "admin_all_master_departments"
  on "public"."master_departments"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Allow anonymous insert machines"
  on "public"."master_machines"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow anonymous select machines"
  on "public"."master_machines"
  as permissive
  for select
  to public
using (true);



  create policy "Allow anonymous update machines"
  on "public"."master_machines"
  as permissive
  for update
  to public
using (true);



  create policy "admin_all_master_machines"
  on "public"."master_machines"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Allow anonymous insert problems"
  on "public"."master_problems"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow anonymous select problems"
  on "public"."master_problems"
  as permissive
  for select
  to public
using (true);



  create policy "Allow anonymous update problems"
  on "public"."master_problems"
  as permissive
  for update
  to public
using (true);



  create policy "admin_all_master_problems"
  on "public"."master_problems"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "admin_all_master_shifts"
  on "public"."master_shifts"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "admin_all_profiles"
  on "public"."profiles"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Allow admin read logs"
  on "public"."system_logs"
  as permissive
  for select
  to public
using (true);



  create policy "Allow admin update logs"
  on "public"."system_logs"
  as permissive
  for update
  to public
using (true);



  create policy "Allow anonymous insert logs"
  on "public"."system_logs"
  as permissive
  for insert
  to public
with check (true);



  create policy "allow admin read activity logs"
  on "public"."user_activity_logs"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "allow logged users insert activity logs"
  on "public"."user_activity_logs"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "read waste reasons"
  on "public"."waste_reasons"
  as permissive
  for select
  to public
using (true);


CREATE TRIGGER trg_daily_waste_reports_updated_at BEFORE UPDATE ON public.daily_waste_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


