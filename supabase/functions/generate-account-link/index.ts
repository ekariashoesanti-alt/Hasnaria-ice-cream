import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const origin = "https://hasnaria-business-analyzer.vercel.app";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), {
  status: s,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return out({ error: "Unauthorized" }, 401);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const gu = await admin.auth.getUser(bearer);
    const user = gu.data.user;
    if (!user) return out({ error: "Unauthorized" }, 401);
    const pr = await admin.from("user_profiles").select("brand_id,status,is_super_admin").eq("id", user.id).maybeSingle();
    if (!pr.data || pr.data.status !== "active" || pr.data.is_super_admin !== true) return out({ error: "Super Admin access required" }, 403);
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const mode = body.mode === "activate" ? "activate" : "recovery";
    const tr = await admin.from("account_access_registry").select("email,status,auth_user_id,brand_id").eq("brand_id", pr.data.brand_id).ilike("email", email).maybeSingle();
    if (!tr.data || tr.data.status === "disabled") return out({ error: "Akun tidak tersedia" }, 404);
    if (mode === "recovery" && !tr.data.auth_user_id) return out({ error: "Akun belum aktif" }, 409);
    const type = mode === "activate" && !tr.data.auth_user_id ? "invite" : "recovery";
    const gl = await admin.auth.admin.generateLink({
      type,
      email: tr.data.email,
      options: { redirectTo: `${origin}/set-password.html?mode=${mode}` },
    } as any);
    if (gl.error) throw gl.error;
    const link = gl.data?.properties?.action_link;
    if (!link) throw new Error("Secure link tidak tersedia");
    return out({ ok: true, action_link: link, email: tr.data.email, mode });
  } catch (e) {
    return out({ error: e instanceof Error ? e.message : "Gagal membuat link" }, 500);
  }
});
