import { createHash, randomBytes, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { sign } from "jsonwebtoken";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../shared/errors/AppError";

import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
} from "./auth.schemas";

const dummyPasswordHash =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: {
      email: input.email,
    },
  });

  if (existing) {
    throw new AppError("Email já cadastrado", 409);
  }

  const passwordHash = await hash(input.password, 10);

  return prisma.user.create({
    data: {
      ...input,
      password: passwordHash,
    },
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
  const user = await prisma.user.findUnique({
    where: {
      email: input.email,
    },
  });

  // Compara um hash mesmo quando o email não existe.
  const validPassword = await compare(
    input.password,
    user?.password ?? dummyPasswordHash,
  );

  if (
    !user ||
    !validPassword ||
    user.deletedAt ||
    user.status !== "ACTIVE"
  ) {
    throw new AppError("Email ou senha inválidos", 401);
  }

  const sessionId = randomUUID();

  const refreshToken = randomBytes(32).toString("hex");

  // Somente o hash do refresh token será salvo no banco.
  const refreshTokenHash = createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  );

  const accessToken = sign(
    { sid: sessionId },
    env.JWT_SECRET,
    {
      subject: user.id,
      algorithm: "HS256",
      expiresIn: 3600,
      issuer: "api-projeto-mottors",
      audience: "mottors-api",
    },
  );

  await prisma.$transaction([
    prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        expiresAt,
      },
    }),

    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    }),
  ]);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: 3600,
  };
}

export async function refreshSession(input: RefreshInput) {
  const currentHash = createHash("sha256")
    .update(input.refresh_token)
    .digest("hex");

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: {
        refreshTokenHash: currentHash,
      },
      include: {
        user: true,
      },
    });

    const now = new Date();

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.deletedAt ||
      session.user.status !== "ACTIVE"
    ) {
      throw new AppError("Sessão inválida ou expirada", 401);
    }

    const refreshToken = randomBytes(32).toString("hex");

    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // A troca só acontece se o token anterior ainda estiver válido.
    // Duas requisições simultâneas não podem renovar o mesmo token.
    const result = await tx.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: currentHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        refreshTokenHash,
      },
    });

    if (result.count !== 1) {
      throw new AppError("Sessão inválida ou expirada", 401);
    }

    const accessToken = sign(
      { sid: session.id },
      env.JWT_SECRET,
      {
        subject: session.userId,
        algorithm: "HS256",
        expiresIn: 3600,
        issuer: "api-projeto-mottors",
        audience: "mottors-api",
      },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 3600,
    };
  });
}
export async function logoutSession(
  sessionId: string,
  userId: string,
) {
  await prisma.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}