import { describe, expect, it } from "vitest";
import { failureLimiter, rateLimit, resetRateLimits } from "@/server/rate-limit";

describe("rate limiting", () => {
  it("fixed window limiter blocks after the limit", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    expect(rateLimit("k", 3, 60_000).ok).toBe(false);
  });
  it("failure limiter counts only failures and resets on success", () => {
    resetRateLimits();
    for (let i = 0; i < 8; i++) failureLimiter.fail("u", 60_000);
    expect(failureLimiter.blocked("u", 8)).toBe(true);
    failureLimiter.clear("u");
    expect(failureLimiter.blocked("u", 8)).toBe(false);
  });
});
