import { authed } from "@/server/api";
import { readReport } from "@/domain/pdf/export";

const FA: Record<string, string> = { workout: "برنامه-تمرینی", nutrition: "برنامه-غذایی", combined: "برنامه-کامل", progress: "گزارش-پیشرفت" };

export const GET = authed<{ id: string }>(async ({ db, user, params }) => {
  const { report, buf } = await readReport(db, user.id, params.id);
  const ascii = (report.fileName ?? "fitflow.pdf").replace(/[^A-Za-z0-9._-]/g, "_");
  const utf = encodeURIComponent(`FitFlow-${FA[report.kind] ?? report.kind}-${report.id.slice(0, 6)}.pdf`);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf}`,
      "Cache-Control": "private, no-store",
    },
  });
});
