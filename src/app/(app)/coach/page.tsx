import { PageHeader } from "@/components/ui";
import { CoachChat } from "@/components/coach/coach-chat";

export const metadata = { title: "مربی هوشمند" };

export default function Page() {
  return (
    <>
      <PageHeader title="از مربی هوشمند بپرسید" subtitle="درخواست‌های تمرینی و تغذیه‌ای به زبان ساده" />
      <CoachChat />
    </>
  );
}
