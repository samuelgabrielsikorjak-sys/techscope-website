// supabase/functions/cron-call-slots/index.ts
// ============================================================================
// FALLBACK — použiť LEN ak pg_cron nie je v tvojom Supabase pláne dostupný.
// Ak pg_cron funguje (bežný prípad), táto funkcia nie je vôbec potrebná —
// pozri "select cron.schedule(...)" v sql/supabase-schema.sql, časť
// "AUTOMATIZÁCIA call_slots".
//
// Táto Edge Function len zavolá jednu z dvoch už existujúcich SQL funkcií
// (generuj_tyzdenne_sloty / vycisti_stare_sloty) cez service_role kľúč a
// vráti výsledok. Žiadna vlastná logika ani notifikácie — tie rieši iná
// funkcia (notify-document-upload).
//
// Nasadenie: Dashboard → Edge Functions → Create function → názov
// "cron-call-slots" → vložiť celý tento súbor → Deploy.
//
// Env / secrets:
//   CRON_SECRET                – nastaviť RUČNE (Edge Functions → Secrets),
//                                ľubovoľný dlhý náhodný reťazec; bez neho by
//                                mohol funkciu zavolať ktokoľvek, kto uhádne URL
//   SUPABASE_URL               – Supabase injektuje automaticky
//   SUPABASE_SERVICE_ROLE_KEY  – Supabase injektuje automaticky; obchádza RLS
//
// Volanie (externý scheduler, napr. cron-job.org):
//   POST https://<project-ref>.functions.supabase.co/cron-call-slots?task=generuj
//   POST https://<project-ref>.functions.supabase.co/cron-call-slots?task=vycisti
//   Hlavička: x-cron-secret: <rovnaká hodnota ako CRON_SECRET>
//
// Odporúčaný harmonogram v cron-job.org (rovnaký ako pg_cron variant):
//   generuj  — raz týždenne, nedeľa ~20:00 SEČ/SELČ
//   vycisti  — raz denne, napr. 03:00 SEČ/SELČ
// ============================================================================

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const task = new URL(req.url).searchParams.get("task");
  const fn = task === "generuj"
    ? "generuj_tyzdenne_sloty"
    : task === "vycisti"
    ? "vycisti_stare_sloty"
    : null;

  if (!fn) {
    return json({ ok: false, error: "task musí byť 'generuj' alebo 'vycisti'" }, 400);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`cron-call-slots: ${fn} zlyhalo:`, res.status, detail);
    return json({ ok: false, task: fn, error: detail }, 500);
  }

  const pocet = await res.json(); // funkcie vracajú int (počet pridaných / zmazaných riadkov)
  return json({ ok: true, task: fn, pocet });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
