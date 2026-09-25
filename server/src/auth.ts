import jwt from "jsonwebtoken";

export type Role = "user" | "moderator" | "admin";
export const canEdit = (role: Role): boolean => role === "moderator" || role === "admin";
export function userIdFromToken(token: unknown, secret: string): string | null {
  if (typeof token !== "string" || !token) return null;
  try {
    const d = jwt.verify(token, secret, { algorithms: ["HS256"] }) as { userId?: unknown };
    return typeof d.userId === "string" ? d.userId : null;
  } catch {
    return null;
  }
}
