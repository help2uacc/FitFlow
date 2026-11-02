import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import type { DB } from "@/db/client";
import { createTestDb, createUser, completeOnboardingFor, makeRunner } from "../helpers";
import { authenticate, createInvite, createSession, inviteValid, registerUser, validateSession, revokeSession } from "@/domain/auth/service";
import { requestInitialProgram } from "@/domain/program/service";
import { requestReport, reportFilePath, readReport } from "@/domain/pdf/export";
import { getJob } from "@/domain/ai/jobs";
import { getWorkoutDetail } from "@/domain/tracking/workouts";
import { startWorkout } from "@/domain/tracking/workouts";
import { todayISO } from "@/lib/dates";

let db: DB;
beforeEach(() => { db = createTestDb(); });

describe("authentication & authorization", () => {
  it("registers the owner, then closes registration", async () => {
    const u = await createUser(db);
    expect(u.role).toBe("owner");
    await expect(registerUser(db, { email: "x@y.z", displayName: "x", password: "AnotherPass123" }, false)).rejects.toMatchObject({ code: "registration_closed" });
  });
  it("invite links allow exactly one registration while registration is closed", async () => {
    const owner = await createUser(db);
    const { token } = createInvite(db, owner.id);
    const reg = (email: string, invite?: string) => registerUser(db, { email, displayName: "x", password: "AnotherPass123", invite }, false);
    await expect(reg("x@y.z", "bogus")).rejects.toMatchObject({ code: "invite_invalid" });
    expect(inviteValid(db, token)).toBe(true);
    expect((await reg("x@y.z", token)).role).toBe("user");
    expect(inviteValid(db, token)).toBe(false);
    await expect(reg("z@y.z", token)).rejects.toMatchObject({ code: "invite_invalid" });
    // a failed registration (taken email) must not burn the invite
    const second = createInvite(db, owner.id).token;
    await expect(reg("x@y.z", second)).rejects.toMatchObject({ code: "email_taken" });
    expect(inviteValid(db, second)).toBe(true);
  });
  it("rejects weak passwords and wrong credentials", async () => {
    await expect(registerUser(db, { email: "a@b.c", displayName: "a", password: "short" }, false)).rejects.toMatchObject({ code: "weak_password" });
    await createUser(db);
    await expect(authenticate(db, "owner@example.com", "wrong-password-1")).rejects.toMatchObject({ code: "invalid_credentials" });
    expect((await authenticate(db, "OWNER@example.com", "StrongPass123")).email).toBe("owner@example.com");
  });
  it("sessions are validated, stored hashed and revocable", async () => {
    const u = await createUser(db);
    const s = createSession(db, u.id, { remember: false });
    const v = validateSession(db, s.token)!;
    expect(v.user.id).toBe(u.id);
    expect(v.sessionId).not.toBe(s.token);
    expect("passwordHash" in v.user).toBe(false);
    revokeSession(db, v.sessionId);
    expect(validateSession(db, s.token)).toBeNull();
    expect(validateSession(db, "garbage")).toBeNull();
  });
  it("users cannot read each other's records", async () => {
    const a = await createUser(db, "a@example.com");
    const b = await registerUser(db, { email: "b@example.com", displayName: "b", password: "StrongPass123" }, true);
    const w = startWorkout(db, a.id, { clientId: "client-aaaaaaaa", date: todayISO() });
    expect(() => getWorkoutDetail(db, b.id, w.id)).toThrow();
    expect(getWorkoutDetail(db, a.id, w.id).workout.id).toBe(w.id);
  });
});

describe("PDF generation", () => {
  it("renders a real, verified workout PDF into private storage", async () => {
    rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true });
    const u = await createUser(db);
    completeOnboardingFor(db, u.id);
    const runner = makeRunner(db);
    requestInitialProgram(db, u.id);
    await runner.drain();
    expect(() => requestReport(db, u.id, "nutrition")).toThrow(); // nutrition disabled → no nutrition PDF
    const r = requestReport(db, u.id, "workout");
    await runner.drain();
    expect(getJob(db, u.id, r.jobId!).status).toBe("completed");
    const { report, buf } = await readReport(db, u.id, r.id);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(20_000);
    expect(existsSync(reportFilePath(u.id, report.fileName!))).toBe(true);
    expect(readFileSync(reportFilePath(u.id, report.fileName!)).length).toBe(report.sizeBytes);
  }, 120_000);
});
