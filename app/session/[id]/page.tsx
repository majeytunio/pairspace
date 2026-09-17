/**
 * Author: Ali Quraishi
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SessionWorkspace from "@/components/SessionWorkspace";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, name, language, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!session) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-lg font-semibold text-ink">Session not found</h1>
        <p className="mt-2 text-sm text-ink/60">
          It may have been deleted, or you don&rsquo;t have access to it.
        </p>
      </main>
    );
  }

  // Ensure this visitor is recorded as a participant (idempotent).
  await supabase
    .from("session_participants")
    .upsert(
      { session_id: session.id, user_id: userData.user.id, role: "editor" },
      { onConflict: "session_id,user_id", ignoreDuplicates: true }
    );

  return (
    <SessionWorkspace
      sessionId={session.id}
      sessionName={session.name}
      language={session.language as "javascript" | "python"}
      user={{
        userId: userData.user.id,
        name: userData.user.email?.split("@")[0] ?? "Anonymous",
        color: colorFromId(userData.user.id),
      }}
    />
  );
}

function colorFromId(id: string): string {
  const palette = ["#2F6F5E", "#C1502E", "#3E6BA8", "#8C5E9C", "#B08A2E"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % palette.length;
  return palette[hash];
}
