import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AppState = {
  pin: string;
  swimmers: Array<{
    id: string;
    name: string;
    usualPrice: number;
    archived: boolean;
    createdAt: string;
    order: number;
  }>;
  attendance: unknown[];
  transactions: unknown[];
  pendingPayments: Array<{
    id: string;
    swimmerId: string;
    amount: number;
    status: "pending" | "confirmed" | "rejected";
    createdAt: string;
    confirmedAt?: string;
    rejectedAt?: string;
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-coach-pin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const seedNames = [
  "靖翹",
  "奕熹",
  "晞兒",
  "楷楷",
  "筱白",
  "子菩",
  "義騰",
  "雪諾",
  "永皓",
  "巧澄",
  "熙朗",
  "知韻",
  "雅晴",
  "羅偉祺",
  "馮驤",
  "穎希",
  "筱淞",
  "樂澄",
  "君諾",
  "穎天",
  "星宇",
  "日朗",
  "冼政霖",
  "金文馨",
  "郭梓睿",
  "菲澄",
  "一琛",
  "昕潼",
  "盧以弢",
  "毛烈度",
  "嘉寶",
  "迦諾",
  "逸信",
  "奕訢",
  "卓翹",
  "曾翔皓",
];

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "getState") {
      return json({ state: await getOrCreateState() });
    }

    if (body.action === "submitPayment") {
      const amount = toWholeAmount(body.amount);
      const swimmerId = String(body.swimmerId || "");
      if (!amount || !swimmerId) return json({ error: "Invalid payment" }, 400);

      const state = await getOrCreateState();
      if (!state.swimmers.some((swimmer) => swimmer.id === swimmerId)) {
        return json({ error: "Swimmer not found" }, 404);
      }
      state.pendingPayments.push({
        id: crypto.randomUUID(),
        swimmerId,
        amount,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await saveState(state);
      return json({ state });
    }

    if (body.action === "verifyPin") {
      const state = await getOrCreateState();
      return json({ ok: request.headers.get("x-coach-pin") === state.pin });
    }

    if (body.action === "saveState") {
      const current = await getOrCreateState();
      if (request.headers.get("x-coach-pin") !== current.pin) {
        return json({ error: "Invalid coach PIN" }, 401);
      }
      const nextState = validateState(body.state);
      await saveState(nextState);
      return json({ state: nextState });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Unexpected error",
    }, 500);
  }
});

async function getOrCreateState(): Promise<AppState> {
  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  if (data?.data) return data.data as AppState;
  const state = createSeedState();
  await saveState(state);
  return state;
}

async function saveState(state: AppState) {
  const { error } = await supabase.from("app_state").upsert({
    id: "main",
    data: state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function createSeedState(): AppState {
  const now = new Date().toISOString();
  return {
    pin: "1212",
    swimmers: seedNames.map((name, order) => ({
      id: crypto.randomUUID(),
      name,
      usualPrice: 15,
      archived: false,
      createdAt: now,
      order,
    })),
    attendance: [],
    transactions: [],
    pendingPayments: [],
  };
}

function validateState(value: unknown): AppState {
  const state = value as AppState;
  if (!state || typeof state !== "object") throw new Error("Invalid state");
  if (typeof state.pin !== "string" || state.pin.length < 3) {
    throw new Error("Invalid PIN");
  }
  if (!Array.isArray(state.swimmers)) throw new Error("Invalid swimmers");
  if (!Array.isArray(state.attendance)) throw new Error("Invalid attendance");
  if (!Array.isArray(state.transactions)) throw new Error("Invalid transactions");
  if (!Array.isArray(state.pendingPayments)) {
    throw new Error("Invalid pending payments");
  }
  return state;
}

function toWholeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  return amount;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
