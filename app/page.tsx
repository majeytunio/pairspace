/**
 * Author: Ali Quraishi
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewSessionForm from "@/components/NewSessionForm";
import SignOutButton from "@/components/SignOutButton";

export default async function HomePage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect("/login");

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, language, status, last_active_at")
    .order("last_active_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink">PairSpace</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink/50">{userData.user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <NewSessionForm />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink/50">
          Your sessions
        </h2>
        {!sessions?.length && (
          <p className="text-sm text-ink/50">No sessions yet — start one above.</p>
        )}
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {sessions?.map((s) => (
            <li key={s.id}>
              <a
                href={`/session/${s.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-paper/60"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-ink/50">{s.language}</p>
                </div>
                <span className="text-xs text-ink/40">
                  {new Date(s.last_active_at).toLocaleString()}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
