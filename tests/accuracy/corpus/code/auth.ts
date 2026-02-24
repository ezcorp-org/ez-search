/**
 * Authentication service — handles user login, logout, and JWT token management.
 *
 * Uses bcrypt for password hashing and jsonwebtoken for session tokens.
 * Tokens expire after 24 hours by default; refresh tokens last 30 days.
 */

import { hash, compare } from 'bcrypt';
import { sign, verify } from 'jsonwebtoken';

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '24h';
const REFRESH_EXPIRY = '30d';

interface User {
  id: string;
  email: string;
  passwordHash: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function login(email: string, password: string, users: User[]): Promise<AuthResult> {
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error('Invalid credentials');

  const valid = await compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const accessToken = sign({ sub: user.id, email }, process.env.JWT_SECRET!, {
    expiresIn: TOKEN_EXPIRY,
  });
  const refreshToken = sign({ sub: user.id, type: 'refresh' }, process.env.JWT_SECRET!, {
    expiresIn: REFRESH_EXPIRY,
  });

  return { accessToken, refreshToken, expiresIn: 86400 };
}

export function logout(tokenBlacklist: Set<string>, token: string): void {
  tokenBlacklist.add(token);
}

export function verifyToken(token: string): { sub: string; email: string } {
  return verify(token, process.env.JWT_SECRET!) as { sub: string; email: string };
}
