// supabase/functions/notify-document-upload/index.ts
// ============================================================================
// Database Webhook (Supabase Dashboard → Database → Webhooks) na INSERT do
// public.project_documents volá túto Edge Function. Funkcia zistí email
// klienta + názov projektu a pošle klientovi notifikačný email cez Resend.
//
// Nasadenie: Dashboard → Edge Functions → Create function → názov
// "notify-document-upload" → vložiť celý tento súbor.
//
// Env / secrets:
//   RESEND_API_KEY            – nastaviť RUČNE (Edge Functions → Secrets)
//   SUPABASE_URL              – Supabase injektuje automaticky
//   SUPABASE_SERVICE_ROLE_KEY – Supabase injektuje automaticky; obchádza RLS
//
// Funkcia VŽDY vracia 200, aj keď email zlyhá — inak by Database Webhook
// pokus opakoval donekonečna. Chyby idú do console.error (Edge Function logy).
// ============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Ak doména techscope.sk NIE JE overená v Resend, zmeň na "onboarding@resend.dev"
// (Resend testovacia doména — pošle len na email vlastníka Resend účtu).
const FROM = "TECH-SCOPE <contact@techscope.sk>";
const PORTAL_URL = "https://techscope.sk/klient.html";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload?.record;

    // Database Webhook posiela: { type, table, schema, record, old_record }
    // record = nový riadok project_documents: { id, project_id, nazov, file_url, uploaded_at }
    if (payload?.type !== "INSERT" || !record?.project_id) {
      console.error("notify-document-upload: neočakávaný payload:", JSON.stringify(payload));
      return json({ ok: true, skipped: "invalid payload" });
    }

    const projectId: string = record.project_id;
    const nazovDokumentu: string = record.nazov ?? "(bez názvu)";

    // Join project_documents → projects → clients cez PostgREST embedding.
    // projects má jediný FK na clients (client_id), takže clients(email) je jednoznačné.
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&select=nazov_projektu,clients(email)`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!dbRes.ok) {
      console.error("notify-document-upload: DB fetch zlyhal:", dbRes.status, await dbRes.text());
      return json({ ok: true, error: "db fetch failed" });
    }

    const rows = await dbRes.json();
    const project = Array.isArray(rows) ? rows[0] : null;
    const nazovProjektu: string = project?.nazov_projektu ?? "projekt";
    const klientEmail: string | undefined = project?.clients?.email ?? undefined;

    if (!klientEmail) {
      console.error(
        "notify-document-upload: klient nemá vyplnený email (clients.email), projekt:",
        projectId,
      );
      return json({ ok: true, skipped: "no client email" });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: klientEmail,
        subject: `Nový dokument v projekte ${nazovProjektu}`,
        text:
          `Dobrý deň,\n\n` +
          `do vášho projektu „${nazovProjektu}" bol nahraný nový dokument: ${nazovDokumentu}.\n\n` +
          `Zobraziť si ho môžete vo svojom klientskom portáli:\n${PORTAL_URL}\n\n` +
          `S pozdravom,\nTECH-SCOPE`,
      }),
    });

    if (!emailRes.ok) {
      console.error("notify-document-upload: Resend zlyhal:", emailRes.status, await emailRes.text());
      return json({ ok: true, error: "email send failed" });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("notify-document-upload: neočakávaná chyba:", err);
    return json({ ok: true, error: "unexpected" });
  }
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
