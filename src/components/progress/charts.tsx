"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fa = (n: unknown) => (typeof n === "number" ? n.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : String(n ?? ""));
const shortDate = (iso: unknown) => {
  if (typeof iso !== "string" || iso.length < 10) return String(iso ?? "");
  return new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
};
const axis = { fontSize: 11, fill: "currentColor" };
const tooltipStyle = { contentStyle: { borderRadius: 12, fontSize: 12, direction: "rtl" as const, background: "var(--tt-bg, #fff)", color: "#0f172a" }, labelFormatter: shortDate, formatter: (v: unknown, name: unknown) => [fa(v), String(name)] as [string, string] };

export interface SeriesDef { key: string; name: string; color: string; dashed?: boolean }

export function LineTrend({ data, xKey, series, unit, reference }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; unit?: string; reference?: { y: number; label: string } }) {
  return (
    <div className="h-56 w-full text-slate-500 dark:text-slate-400" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey={xKey} tickFormatter={shortDate} tick={axis} minTickGap={24} />
          <YAxis tick={axis} tickFormatter={fa} domain={["auto", "auto"]} width={44} unit={unit} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />}
          {reference && <ReferenceLine y={reference.y} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: reference.label, fontSize: 11, fill: "#b45309" }} />}
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "5 4" : undefined} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, xKey, series, xFormatter }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; xFormatter?: (v: unknown) => string }) {
  return (
    <div className="h-56 w-full text-slate-500 dark:text-slate-400" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormatter ?? shortDate} tick={axis} minTickGap={16} />
          <YAxis tick={axis} tickFormatter={fa} width={44} allowDecimals={false} />
          <Tooltip {...tooltipStyle} labelFormatter={xFormatter ?? shortDate} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />}
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
