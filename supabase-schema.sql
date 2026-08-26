-- ============================================================================
-- TECH-SCOPE — Supabase schema: call_slots, leads, RPC funkcie, RLS politiky
--
-- POZNÁMKA: pôvodný súbor sa stratil z lokálneho projektu — toto je
-- rekonštrukcia na základe histórie konverzácie, v ktorej bol pôvodne
-- napísaný, PLUS oprava chýbajúcich "authenticated" politík pre admin.html
-- (pozri sekciu "OPRAVA" nižšie — to je root cause bugu, kde sa nové
-- rezervácie neobjavovali v admin paneli).
--
-- Ak tabuľky/funkcie už v Supabase existujú, "create table" zlyhá na
-- "already exists" — v tom prípade stačí spustiť len sekciu OPRAVA úplne
-- dole, tá je bezpečná spustiť opakovane (drop policy if exists + create).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM typy
-- ----------------------------------------------------------------------------
create type lead_status as enum ('novy', 'kontaktovany', 'uzavrety');

-- ----------------------------------------------------------------------------
-- Tabuľka: call_slots
-- ----------------------------------------------------------------------------
create table call_slots (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  cas_od time not null,
  cas_do time not null,
  dostupny boolean not null default true,
  rezervovany_lead_id uuid null,
  created_at timestamptz not null default now(),

  constraint call_slots_cas_check check (cas_do > cas_od)
);

create index idx_call_slots_datum on call_slots (datum);
create index idx_call_slots_dostupny on call_slots (dostupny);

-- ----------------------------------------------------------------------------
-- Tabuľka: leads
-- ----------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  meno_priezvisko text not null,
  nazov_firmy text not null,
  pozicia text not null,
  email text not null,
  telefon text not null,
  -- Jediný produkt (Data Compass) — stĺpec ostáva kvôli histórii/reportingu,
  -- ale klient už jeho hodnotu neposiela, dopĺňa sa automaticky defaultom.
  produkt text not null default 'data_compass',
  rozpocet text not null,
  urgencia text not null,
  popis_projektu text not null,
  zdroj text null,
  gdpr_suhlas boolean not null default false,
  slot_id uuid null references call_slots (id) on delete set null,
  status lead_status not null default 'novy',
  created_at timestamptz not null default now(),

  constraint leads_gdpr_suhlas_check check (gdpr_suhlas = true)
);

create index idx_leads_status on leads (status);
create index idx_leads_slot_id on leads (slot_id);

alter table call_slots
  add constraint call_slots_rezervovany_lead_id_fkey
  foreign key (rezervovany_lead_id) references leads (id) on delete set null;

-- ============================================================================
-- Row Level Security — pôvodné (verejné) politiky
-- ============================================================================
alter table call_slots enable row level security;
alter table leads enable row level security;

-- call_slots: verejnosť môže LEN čítať dostupné sloty
create policy "Verejnost moze citat dostupne sloty"
  on call_slots
  for select
  to anon
  using (dostupny = true);

-- leads: verejnosť môže LEN vkladať nový lead
create policy "Verejnost moze vlozit novy lead"
  on leads
  for insert
  to anon
  with check (status = 'novy');

-- ============================================================================
-- RPC: verejný počet rezervovaných call_slots v aktuálnom mesiaci
-- ============================================================================
create or replace function public.pocet_rezervovanych_slotov_tento_mesiac()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from call_slots
  where dostupny = false
    and date_trunc('month', datum) = date_trunc('month', current_date);
$$;

grant execute on function public.pocet_rezervovanych_slotov_tento_mesiac() to anon, authenticated;

-- ============================================================================
-- RPC: vytvorenie rezervácie (insert do leads + update call_slots atomicky)
-- ============================================================================
create or replace function public.vytvorit_rezervaciu(
  p_meno_priezvisko text,
  p_nazov_firmy text,
  p_pozicia text,
  p_email text,
  p_telefon text,
  p_rozpocet text,
  p_urgencia text,
  p_popis_projektu text,
  p_zdroj text,
  p_gdpr_suhlas boolean,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_dostupny boolean;
begin
  select dostupny into v_dostupny
  from call_slots
  where id = p_slot_id
  for update;

  if v_dostupny is null then
    raise exception 'slot_nenajdeny';
  end if;

  if not v_dostupny then
    raise exception 'slot_obsadeny';
  end if;

  insert into leads (
    meno_priezvisko, nazov_firmy, pozicia, email, telefon,
    rozpocet, urgencia, popis_projektu, zdroj,
    gdpr_suhlas, slot_id, status
  ) values (
    p_meno_priezvisko, p_nazov_firmy, p_pozicia, p_email, p_telefon,
    p_rozpocet, p_urgencia, p_popis_projektu, p_zdroj,
    p_gdpr_suhlas, p_slot_id, 'novy'
  )
  -- produkt stĺpec sa nevkladá explicitne — použije sa jeho table default
  -- ('data_compass'), keďže existuje len jeden produkt.
  returning id into v_lead_id;

  update call_slots
  set dostupny = false,
      rezervovany_lead_id = v_lead_id
  where id = p_slot_id;

  return v_lead_id;
end;
$$;
-- Zámerne BEZ "exception when others" bloku — akékoľvek zlyhanie (napr.
-- constraint violation) sa má prejaviť ako reálny error na klientovi, nie
-- ticho zamlčať. Ak niekedy pridáš vlastný exception handler sem, vždy ho
-- ukonči "raise;" (re-raise), inak klient uvidí falošný úspech presne ako
-- v tomto bugu.

grant execute on function public.vytvorit_rezervaciu(
  text, text, text, text, text, text, text, text, text, boolean, uuid
) to anon, authenticated;

-- ============================================================================
-- OPRAVA (root cause bugu): chýbajúce "authenticated" politiky pre admin.html
-- ============================================================================
-- admin.html/admin.js číta leads a call_slots PRIAMO (nie cez RPC), ako
-- prihlásený "authenticated" používateľ. Bez politík nižšie RLS ticho vráti
-- 0 riadkov pre authenticated rolu (žiadna chyba) — presne symptóm, kde nová
-- rezervácia "zmizne" aj keď insert cez vytvorit_rezervaciu prebehol v poriadku.
--
-- "drop policy if exists" pred každým create robí tento blok bezpečný na
-- opakované spustenie.

drop policy if exists "Admin moze citat vsetky leady" on leads;
create policy "Admin moze citat vsetky leady"
  on leads
  for select
  to authenticated
  using (true);

drop policy if exists "Admin moze upravovat leady" on leads;
create policy "Admin moze upravovat leady"
  on leads
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Admin moze mazat leady" on leads;
create policy "Admin moze mazat leady"
  on leads
  for delete
  to authenticated
  using (true);

drop policy if exists "Admin moze citat vsetky sloty" on call_slots;
create policy "Admin moze citat vsetky sloty"
  on call_slots
  for select
  to authenticated
  using (true);

drop policy if exists "Admin moze pridavat sloty" on call_slots;
create policy "Admin moze pridavat sloty"
  on call_slots
  for insert
  to authenticated
  with check (true);

drop policy if exists "Admin moze mazat sloty" on call_slots;
create policy "Admin moze mazat sloty"
  on call_slots
  for delete
  to authenticated
  using (true);

-- ============================================================================
-- exit_leads — kontakty zachytené exit-intent/neaktivita popupom
-- (assets/exit-popup.js) naprieč verejnými stránkami. Samostatná od leads,
-- keďže ide o oveľa "ľahší" kontakt (len email/telefón, bez produktu,
-- rozpočtu, popisu projektu) zachytený mimo hlavného booking flow.
-- ============================================================================
create table exit_leads (
  id uuid primary key default gen_random_uuid(),
  meno text null,
  email text null,
  telefon text null,
  zdrojova_stranka text not null,
  created_at timestamptz not null default now(),

  constraint exit_leads_kontakt_check check (email is not null or telefon is not null)
);

create index idx_exit_leads_created_at on exit_leads (created_at);

alter table exit_leads enable row level security;

drop policy if exists "Verejnost moze vlozit exit lead" on exit_leads;
create policy "Verejnost moze vlozit exit lead"
  on exit_leads
  for insert
  to anon
  with check (true);

drop policy if exists "Admin moze citat exit leady" on exit_leads;
create policy "Admin moze citat exit leady"
  on exit_leads
  for select
  to authenticated
  using (true);

drop policy if exists "Admin moze mazat exit leady" on exit_leads;
create policy "Admin moze mazat exit leady"
  on exit_leads
  for delete
  to authenticated
  using (true);

-- ============================================================================
-- klient.html — portál pre klientov (projects, project_updates,
-- project_documents, project_questions) + OPRAVA admin/klient rolí
-- ============================================================================
-- KRITICKÉ: pred touto sekciou boli VŠETKY "admin" politiky vyššie napísané
-- ako "to authenticated using (true)" — teda "ktokoľvek prihlásený", nie
-- "len admin". Kým existoval jediný typ prihláseného účtu (admin.html), to
-- fungovalo. Teraz, keď klient.html zavádza DRUHÝ typ prihláseného účtu
-- (klienti, cez rovnaký supabase.auth), by tie isté politiky umožnili
-- ktorémukoľvek prihlásenému klientovi cez devtools/priamy dotaz vidieť
-- VŠETKY leady, VŠETKY call_slots aj VŠETKY exit_leads — nielen svoje dáta.
-- Nižšie preto: (1) tabuľka `admins` + is_admin() helper, (2) prepísanie
-- všetkých doterajších "using (true)" admin politík na "using (is_admin())".
--
-- Po spustení tejto migrácie MUSÍŠ ručne pridať aspoň jeden riadok do
-- `admins` (id nájdeš v Supabase dashboard → Authentication → Users):
--   insert into admins (user_id) values ('<uuid-tvojho-admin-uctu>');
-- Bez toho admin.html prestane vidieť leady/sloty (is_admin() vráti false).

create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Zámerne ŽIADNE RLS politiky na `admins` — nikto (ani authenticated) ju
-- nevie cez klientský SDK čítať/meniť, len is_admin() nižšie (SECURITY
-- DEFINER obchádza RLS) a service_role v Supabase dashboarde.
alter table admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;

-- ---- prepísanie pôvodných "using (true)" admin politík na is_admin() ----
drop policy if exists "Admin moze citat vsetky leady" on leads;
create policy "Admin moze citat vsetky leady"
  on leads for select to authenticated using (is_admin());

drop policy if exists "Admin moze upravovat leady" on leads;
create policy "Admin moze upravovat leady"
  on leads for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Admin moze mazat leady" on leads;
create policy "Admin moze mazat leady"
  on leads for delete to authenticated using (is_admin());

drop policy if exists "Admin moze citat vsetky sloty" on call_slots;
create policy "Admin moze citat vsetky sloty"
  on call_slots for select to authenticated using (is_admin());

drop policy if exists "Admin moze pridavat sloty" on call_slots;
create policy "Admin moze pridavat sloty"
  on call_slots for insert to authenticated with check (is_admin());

drop policy if exists "Admin moze mazat sloty" on call_slots;
create policy "Admin moze mazat sloty"
  on call_slots for delete to authenticated using (is_admin());

drop policy if exists "Admin moze citat exit leady" on exit_leads;
create policy "Admin moze citat exit leady"
  on exit_leads for select to authenticated using (is_admin());

drop policy if exists "Admin moze mazat exit leady" on exit_leads;
create policy "Admin moze mazat exit leady"
  on exit_leads for delete to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- Tabuľka: clients — profil klienta, NEZÁVISLE od jeho prihlasovacieho účtu
-- ----------------------------------------------------------------------------
-- Admin vie v admin.html vytvoriť profil klienta (meno, firma, email) a
-- rovno mu založiť projekt ešte predtým, než pre neho existuje prihlasovací
-- účet — preto `id` NIE JE naviazané na auth.users pri vzniku riadku.
-- `auth_user_id` je nullable a dopĺňa sa AŽ KEĎ admin ručne založí účet v
-- Supabase dashboard → Authentication → Add user (rovnako ako pri admin
-- účte) a sem prilepí jeho UUID. Bez tohto prepojenia klient.html vidí
-- prázdny portál ("žiadny projekt"), pretože RLS nižšie ho vyžaduje.
create table clients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null unique references auth.users (id) on delete set null,
  meno_priezvisko text not null,
  nazov_firmy text null,
  email text null,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "Admin cita vsetkych klientov"
  on clients for select to authenticated using (is_admin());

create policy "Admin vklada klientov"
  on clients for insert to authenticated with check (is_admin());

create policy "Admin upravuje klientov"
  on clients for update to authenticated using (is_admin()) with check (is_admin());

create policy "Admin maze klientov"
  on clients for delete to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- Tabuľka: projects
-- ----------------------------------------------------------------------------
create type project_status as enum ('aktivny', 'pozastaveny', 'dokonceny');

-- Fázy zdieľané naprieč všetkými 4 službami (rovnaký 6-fázový postup, aký
-- web-copy sľubuje na produktových stránkach v sekcii "Ako pracujeme").
create type project_faza as enum (
  'vstupna_analyza',
  'definicia_metrik',
  'navrh_architektury',
  'vyvoj',
  'testovanie_review',
  'odovzdanie_zaskolenie'
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  nazov_projektu text not null,
  -- 'data_compass' | 'web_mobile' | 'softver_na_mieru' | 'ai_riesenia'
  sluzba text not null,
  status project_status not null default 'aktivny',
  faza project_faza not null default 'vstupna_analyza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_client_id on projects (client_id);

alter table projects enable row level security;

-- Klient je prihlásený ako auth.users, ale projects.client_id ukazuje na
-- clients.id (stabilný profil) — spojenie ide cez clients.auth_user_id.
create policy "Klient cita vlastne projekty"
  on projects for select to authenticated
  using (
    exists (
      select 1 from clients c
      where c.id = projects.client_id and c.auth_user_id = auth.uid()
    )
  );

create policy "Admin cita vsetky projekty"
  on projects for select to authenticated using (is_admin());

create policy "Admin vklada projekty"
  on projects for insert to authenticated with check (is_admin());

create policy "Admin upravuje projekty"
  on projects for update to authenticated using (is_admin()) with check (is_admin());

create policy "Admin maze projekty"
  on projects for delete to authenticated using (is_admin());

-- Helper: "patrí tento project_id prihlásenému klientovi" — používajú ho
-- SELECT politiky na project_updates/project_documents/project_questions
-- nižšie namiesto opakovania toho istého "exists (select ... from projects
-- join clients)" poddotazu na troch miestach.
create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from projects p
    join clients c on c.id = p.client_id
    where p.id = p_project_id and c.auth_user_id = auth.uid()
  );
$$;

grant execute on function public.owns_project(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Tabuľka: project_updates — priebežný "log" pre klienta (len na čítanie)
-- ----------------------------------------------------------------------------
create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index idx_project_updates_project_id on project_updates (project_id);

alter table project_updates enable row level security;

create policy "Klient cita updates vlastnych projektov"
  on project_updates for select to authenticated
  using (owns_project(project_id));

create policy "Admin cita vsetky updates"
  on project_updates for select to authenticated using (is_admin());

create policy "Admin vklada updates"
  on project_updates for insert to authenticated with check (is_admin());

create policy "Admin maze updates"
  on project_updates for delete to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- Tabuľka: project_documents — metadáta k súborom v Storage bucket-e
-- 'project-documents' (privátny — sťahovanie len cez createSignedUrl)
-- ----------------------------------------------------------------------------
create table project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  nazov text not null,
  -- Napriek názvu NEJDE o hotovú/verejnú URL — bucket je privátny (public=false),
  -- takže sem sa ukladá len cesta k súboru v bucket-e 'project-documents'
  -- (napr. '<project_id>/zmluva.pdf'), rovnako ako predtým pod menom storage_path.
  -- Skutočná URL na stiahnutie sa generuje až za behu cez createSignedUrl(file_url, ...),
  -- keďže podpísaná URL má platnosť len obmedzenú dobu a nedá sa uložiť natrvalo.
  file_url text not null,
  uploaded_at timestamptz not null default now()
);

create index idx_project_documents_project_id on project_documents (project_id);

alter table project_documents enable row level security;

create policy "Klient cita dokumenty vlastnych projektov"
  on project_documents for select to authenticated
  using (owns_project(project_id));

create policy "Admin cita vsetky dokumenty"
  on project_documents for select to authenticated using (is_admin());

create policy "Admin vklada dokumenty"
  on project_documents for insert to authenticated with check (is_admin());

create policy "Admin maze dokumenty"
  on project_documents for delete to authenticated using (is_admin());

-- Storage bucket 'project-documents' — privátny (public=false), aby súbory
-- neboli dostupné na hádateľnej URL bez podpisu. Dá sa vytvoriť aj cez
-- Dashboard → Storage → New bucket namiesto tohto insertu.
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- createSignedUrl() vyžaduje, aby volajúci prešiel RLS na storage.objects
-- pre SELECT — bez politiky nižšie by generovanie podpísanej URL zlyhalo aj
-- pre vlastníka dokumentu. storage.objects.name = plná cesta v buckete,
-- porovnávame ju s project_documents.file_url (ktorý napriek názvu obsahuje
-- cestu v buckete, nie hotovú URL — pozri komentár pri create table vyššie).
create policy "Klient stahuje dokumenty vlastnych projektov"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from project_documents pd
      where pd.file_url = storage.objects.name
        and owns_project(pd.project_id)
    )
  );

create policy "Admin spravuje vsetky dokumenty v buckete"
  on storage.objects for all to authenticated
  using (bucket_id = 'project-documents' and is_admin())
  with check (bucket_id = 'project-documents' and is_admin());

-- ----------------------------------------------------------------------------
-- Tabuľka: project_questions — doplňujúce otázky od nás ku klientovi
-- ----------------------------------------------------------------------------
create table project_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  otazka text not null,
  odpoved text null,
  zodpovedane boolean not null default false,
  created_at timestamptz not null default now(),
  zodpovedane_at timestamptz null
);

create index idx_project_questions_project_id on project_questions (project_id);

alter table project_questions enable row level security;

create policy "Klient cita otazky vlastnych projektov"
  on project_questions for select to authenticated
  using (owns_project(project_id));

create policy "Admin cita vsetky otazky"
  on project_questions for select to authenticated using (is_admin());

create policy "Admin vklada otazky"
  on project_questions for insert to authenticated with check (is_admin());

create policy "Admin maze otazky"
  on project_questions for delete to authenticated using (is_admin());

-- Klient NEMÁ priamu UPDATE politiku na project_questions — jediný spôsob,
-- ako môže zapísať odpoveď, je RPC nižšie. To zaručuje, že vie zmeniť len
-- `odpoved`/`zodpovedane`/`zodpovedane_at` na SVOJEJ nezodpovedanej otázke,
-- nikdy text otázky samotnej ani cudziu otázku (RLS je len na úrovni
-- riadkov, nie stĺpcov, takže priama UPDATE politika by toto nevedela
-- obmedziť tak presne ako táto funkcia).
create or replace function public.odpovedat_na_otazku(
  p_question_id uuid,
  p_odpoved text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
begin
  select exists (
    select 1
    from project_questions pq
    where pq.id = p_question_id
      and pq.zodpovedane = false
      and owns_project(pq.project_id)
  ) into v_owns;

  if not v_owns then
    raise exception 'otazka_nenajdena_alebo_uz_zodpovedana';
  end if;

  update project_questions
  set odpoved = p_odpoved,
      zodpovedane = true,
      zodpovedane_at = now()
  where id = p_question_id;
end;
$$;

grant execute on function public.odpovedat_na_otazku(uuid, text) to authenticated;
