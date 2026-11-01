import { z } from "zod";
import { authed, body } from "@/server/api";
import { setNutritionMode } from "@/domain/program/service";

const Body = z.object({ mode: z.enum(["none", "full", "guidance"]) });
export const POST = authed(async ({ req, db, user }) => setNutritionMode(db, user.id, (await body(req, Body)).mode));
