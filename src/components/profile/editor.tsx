"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORIES, QUESTIONS, isVisible, type Answers, type CategoryId, type Question } from "@/domain/onboarding/questions";
import { validateAnswer } from "@/domain/onboarding/validate";
import { api, ApiError } from "@/lib/client";
import { Alert, Badge, Button, Card, cx } from "@/components/ui";
import { QuestionInput } from "@/components/onboarding/question-input";
import { formatAnswer } from "@/components/onboarding/wizard";

const SECTION_ALIAS: Record<string, CategoryId> = { goals: "goals", personal: "personal", training: "availability", health: "health", nutrition: "nutrition", lifestyle: "lifestyle", preferences: "preferences", experience: "experience" };

export function ProfileEditor({ answers: initial, openSection }: { answers: Answers; openSection: string | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initial);
  const [open, setOpen] = useState<CategoryId | null>(openSection ? SECTION_ALIAS[openSection] ?? null : "personal");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const groups = useMemo(() => (Object.keys(CATEGORIES) as CategoryId[]).filter((c) => c !== "nutrition_choice").map((c) => ({ id: c, label: CATEGORIES[c], items: QUESTIONS.filter((q) => q.category === c && q.type !== "photo" && isVisible(q, { ...answers, nutrition_mode: c === "nutrition" ? "full" : answers.nutrition_mode })) })).filter((g) => g.items.length), [answers]);

  const startEdit = (q: Question) => { setEditing(q.id); setDraft(answers[q.id] ?? null); setError(null); };
  const save = async (q: Question) => {
    const v = validateAnswer(q, draft);
    if (!v.ok) return setError(v.error);
    setSaving(true);
    try {
      const r = await api<{ planReview: unknown }>("/api/onboarding/answers", { method: "PUT", body: { questionId: q.id, value: v.value } });
      setAnswers({ ...answers, [q.id]: v.value });
      setEditing(null);
      if (r.planReview && q.affects?.length) { setNotice("این تغییر ممکن است روی برنامه شما اثر بگذارد. از بالای صفحه می‌توانید برنامه را به‌روزرسانی کنید."); router.refresh(); }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {notice && <Alert tone="info">{notice}</Alert>}
      {groups.map((g) => (
        <Card key={g.id} className="p-0">
          <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full items-center justify-between p-4 text-right" aria-expanded={open === g.id}>
            <span className="font-bold">{g.label}</span><span className="text-slate-400">{open === g.id ? "−" : "+"}</span>
          </button>
          {open === g.id && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {g.items.map((q) => (
                <li key={q.id} className={cx("p-4", editing === q.id && "bg-slate-50 dark:bg-slate-800/40")}>
                  {editing === q.id ? (
                    <div className="space-y-3">
                      <div className="font-medium">{q.title}</div>
                      {q.help && <p className="text-xs text-slate-500">{q.help}</p>}
                      <QuestionInput q={q} value={draft} onChange={setDraft} />
                      {error && <Alert tone="error">{error}</Alert>}
                      <div className="flex gap-2"><Button size="sm" onClick={() => save(q)} loading={saving}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>انصراف</Button></div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startEdit(q)} className="flex w-full items-start justify-between gap-3 text-right text-sm">
                      <span className="text-slate-500">{q.title} {q.affects?.length ? <Badge className="mr-1" tone="sky">مؤثر بر برنامه</Badge> : null}</span>
                      <span className="shrink-0 font-medium">{formatAnswer(q, answers[q.id])}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
