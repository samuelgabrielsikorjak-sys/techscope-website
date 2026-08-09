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
