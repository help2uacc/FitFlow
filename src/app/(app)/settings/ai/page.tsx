import { PageHeader } from "@/components/ui";
import { AiStatus } from "@/components/settings/ai-status";

export const metadata = { title: "وضعیت هوش مصنوعی" };

export default function Page() {
  return (
    <>
      <PageHeader title="وضعیت سیستم هوش مصنوعی" back="/settings" subtitle="Codex CLI روی سرور و سرویس پس‌زمینه" />
      <AiStatus />
    </>
  );
}
