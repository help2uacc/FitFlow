import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getOnboardingState } from "@/domain/profile/service";
import { requireUser } from "@/server/auth";
import { Wizard } from "@/components/onboarding/wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "پرسشنامه شروع" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const st = getOnboardingState(getDb(), user.id);
  if (st.completed) redirect("/dashboard");
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-6">
      <Wizard initialAnswers={st.answers} currentQuestionId={st.currentQuestionId} name={user.displayName} />
    </main>
  );
}
