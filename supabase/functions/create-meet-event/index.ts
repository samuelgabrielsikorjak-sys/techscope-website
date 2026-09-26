import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = "contact@techscope.sk";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("google token refresh failed", data);
    throw new Error("google_token_refresh_failed");
  }
  return data.access_token as string;
}

async function createCalendarEvent(
  accessToken: string,
  summary: string,
  startISO: string,
  endISO: string,
  attendeeEmails: string[]
) {
  const requestId = crypto.randomUUID();
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        start: { dateTime: startISO, timeZone: "Europe/Bratislava" },
        end: { dateTime: endISO, timeZone: "Europe/Bratislava" },
        attendees: attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error("calendar event create failed", data);
    throw new Error("calendar_event_create_failed");
  }
  return data;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TECH-SCOPE <notifikacie@mail.techscope.sk>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error("resend email failed", to, await res.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const lead = payload.record;

    if (!lead || !lead.slot_id) {
      console.log("no slot_id on lead, skipping meet creation", lead?.id);
      return json({ ok: true, skipped: "no slot_id" });
    }

    // 1. Načítaj slot (vrátane datum, keďže cas_od/cas_do sú typu time, nie timestamp)
    const { data: slot, error: slotError } = await supabase
      .from("call_slots")
      .select("datum, cas_od, cas_do")
      .eq("id", lead.slot_id)
      .single();

    if (slotError || !slot) {
      console.error("slot fetch failed", slotError);
      return json({ ok: true, skipped: "slot not found" });
    }

    const clientEmail: string | null = lead.email ?? null;
    const clientName: string = lead.meno_priezvisko ?? "Klient";
    const firmName: string = lead.nazov_firmy ?? "";

    const startISO = `${slot.datum}T${slot.cas_od}`;
    const endISO = `${slot.datum}T${slot.cas_do}`;

    let meetLink: string | null = null;

    try {
      const accessToken = await getGoogleAccessToken();
      const attendees = [ADMIN_EMAIL, ...(clientEmail ? [clientEmail] : [])];

      const event = await createCalendarEvent(
        accessToken,
        `Strategy call — ${clientName}${firmName ? " (" + firmName + ")" : ""}`,
        startISO,
        endISO,
        attendees
      );

      meetLink =
        event.hangoutLink ??
        event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
        null;
    } catch (googleErr) {
      console.error("google calendar step failed, continuing without meet link", googleErr);
    }

    const startFormatted = new Date(`${slot.datum}T${slot.cas_od}`).toLocaleString("sk-SK", {
      timeZone: "Europe/Bratislava",
      dateStyle: "full",
      timeStyle: "short",
    });

    const bodyHtml = `
      <p>Termín hovoru: <strong>${startFormatted}</strong></p>
      ${
        meetLink
          ? `<p>Google Meet link: <a href="${meetLink}">${meetLink}</a></p>`
          : `<p>Meet link zašleme dodatočne emailom.</p>`
      }
    `;

    // Klientovi email neposielame: potvrdenie dostane ako Google Calendar
    // pozvánku (sendUpdates=all vyššie). Resend ide len adminovi.
    await sendEmail(
      ADMIN_EMAIL,
      `Nový strategy call — ${clientName}${firmName ? " (" + firmName + ")" : ""}`,
      bodyHtml
    );

    return json({ ok: true, meetLink });
  } catch (err) {
    console.error("create-meet-event fatal error", err);
    // vždy 200, aby webhook/frontend nedostal fatal error, ale so CORS hlavičkami
    return json({ ok: false, error: String(err) });
  }
});