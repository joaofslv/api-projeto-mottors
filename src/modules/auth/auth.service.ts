import { sign } from "jsonwebtoken";
import { env } from "../../config/env";
import { compare, hash } from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../shared/errors/AppError";
import type { LoginInput, RegisterInput } from "./auth.schemas";

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new AppError("Email já cadastrado", 409);
  }

  const passwordHash = await hash(input.password, 10);

  return prisma.user.create({
    data: { ...input, password: passwordHash },
    select: {
      id: true,
      type: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Executa bcrypt mesmo se o email não existir para reduzir diferenças de tempo.
  const validPassword = await compare(input.password, user?.password ?? dummyPasswordHash);
  if (!user || !validPassword || user.deletedAt || user.status !== "ACTIVE") {
    throw new AppError("Email ou senha inválidos", 401);
  }

  const accessToken = sign({}, env.JWT_SECRET, {
    subject: user.id,
    algorithm: "HS256",
    expiresIn: 3600,
    issuer: "api-projeto-mottors",
    audience: "mottors-api",
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { access_token: accessToken, token_type: "Bearer", expires_in: 3600 };
}

const dummyPasswordHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
