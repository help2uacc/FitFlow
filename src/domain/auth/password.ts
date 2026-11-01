import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to Argon2id. Parameters follow OWASP guidance (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);
export async function verifyPassword(hashStr: string, pw: string) {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "رمز عبور باید حداقل ۱۰ کاراکتر باشد.";
  if (pw.length > 200) return "رمز عبور بیش از حد طولانی است.";
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d|[۰-۹]/.test(pw)) return "رمز عبور باید شامل حروف و عدد باشد.";
  return null;
}
