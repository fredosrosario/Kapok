import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RECIPIENT = "fredo.srosario@gmail.com";
const TIME_ZONE = "Asia/Macau";

type Swimmer = {
  id: string;
  name: string;
};

type Attendance = {
  date: string;
  swimmerId: string;
  amount: number;
};

type AppState = {
  swimmers?: Swimmer[];
  attendance?: Attendance[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-MO", {
    maximumFractionDigits: 2,
  }).format(value);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fileTimestamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return [value("year"), value("month"), value("day")].join("-") + "-" +
    value("hour") + value("minute");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("KAPOK_EMAIL_CRON_SECRET");
  if (
    !cronSecret ||
    request.headers.get("Authorization") !== `Bearer ${cronSecret}`
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("KAPOK_EMAIL_FROM") ||
    "Kapok Swimming Club <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: "Email delivery is not configured" }, 503);
  }

  try {
    const stateResponse = await fetch(
      `${supabaseUrl}/rest/v1/app_state?id=eq.main&select=data`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );

    if (!stateResponse.ok) {
      throw new Error(`Unable to read app state (${stateResponse.status})`);
    }

    const rows = await stateResponse.json() as Array<{ data: AppState }>;
    const state = rows[0]?.data ?? {};
    const swimmerNames = new Map(
      (state.swimmers ?? []).map((swimmer) => [swimmer.id, swimmer.name]),
    );
    const records = (state.attendance ?? [])
      .map((attendance) => ({
        date: attendance.date,
        name: swimmerNames.get(attendance.swimmerId) || "Unknown swimmer",
        price: Number(attendance.amount) || 0,
      }))
      .sort((a, b) =>
        b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "zh-Hant")
      );

    const generatedDate = new Date();
    const generatedAt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(generatedDate);
    const subject = `Kapok Swim Records - ${generatedAt}`;
    const csv = "\uFEFF" + [
      "Date,Name,Price (MOP)",
      ...records.map((record) =>
        [record.date, record.name, formatAmount(record.price)]
          .map(csvCell)
          .join(",")
      ),
    ].join("\r\n");
    const filename = `kapok-swim-records-${fileTimestamp(generatedDate)}.csv`;
    const text = [
      "Macau Kapok Swimming Club",
      `As of ${generatedAt} (Macau time)`,
      "",
      `Total records: ${records.length}`,
      "The complete swim record is attached as a CSV file.",
    ].join("\n");
    const html = `
      <!doctype html>
      <html lang="en">
        <body style="font-family:Arial,sans-serif;color:#202124;margin:0;padding:24px">
          <h2 style="margin:0 0 6px">Macau Kapok Swimming Club</h2>
          <p style="color:#68707d;margin:0 0 20px">Report generated ${
            escapeHtml(generatedAt)
          } (Macau time)</p>
          <p><strong>${records.length}</strong> swim records are included.</p>
          <p>The complete report is attached as a CSV file.</p>
        </body>
      </html>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [RECIPIENT],
        subject,
        text,
        html,
        attachments: [{
          filename,
          content: bytesToBase64(new TextEncoder().encode(csv)),
        }],
      }),
    });
    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(
        `Email provider rejected the message (${emailResponse.status}): ${
          emailResult?.message || "Unknown error"
        }`,
      );
    }

    return jsonResponse({
      ok: true,
      records: records.length,
      emailId: emailResult.id,
    });
  } catch (error) {
    console.error("Kapok email report failed", error);
    return jsonResponse({ error: "Unable to send email report" }, 500);
  }
});
