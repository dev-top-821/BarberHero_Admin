import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { UserRole } from "@/generated/prisma/enums";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export interface JwtPayload {
  sub: string;
  role: UserRole;
  fullName: string;
  email: string;
  iat: number;
  exp: number;
}

export type TokenUser = {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user: TokenUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, fullName: user.fullName, email: user.email },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

export function generateRefreshToken(user: TokenUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, fullName: user.fullName, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
}

export function extractBearerToken(
  authHeader: string | null
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
