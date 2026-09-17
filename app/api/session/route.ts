/**
 * Author: Ali Quraishi
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const name: string = body.name ?? "Untitled session";
  const language: string = body.language ?? "javascript";

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ name, language, owner_id: userData.user.id })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? "Failed to create session" }, { status: 500 });
  }

  // Owner is automatically a participant with the 'owner' role, bypassing
  // the "self-join can't be owner" RLS policy via the service-role-free
  // owner-manage policy (the insert below runs as the owner, matching
  // sessions.owner_id, so `participants_owner_manage`'s USING clause covers it).
  await supabase.from("session_participants").insert({
    session_id: session.id,
    user_id: userData.user.id,
    role: "owner",
  });

  return NextResponse.json({ id: session.id });
}

export async function GET() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("sessions")
    .select("id, name, language, status, last_active_at")
    .order("last_active_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}
