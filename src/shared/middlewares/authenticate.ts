import type { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../errors/AppError";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const match = /^Bearer ([^\s]+)$/i.exec(
    req.headers.authorization ?? "",
  );

  if (!match) {
    throw new AppError("Token de acesso obrigatório", 401);
  }

  let userId: string;
  let sessionId: string;

  try {
    const payload = verify(match[1], env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "api-projeto-mottors",
      audience: "mottors-api",
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.sid !== "string" ||
      !payload.sid
    ) {
      throw new Error("Token sem usuário ou sessão");
    }

    userId = payload.sub;
    sessionId = payload.sid;
  } catch {
    throw new AppError("Token inválido ou expirado", 401);
  }

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
      user: {
        status: "ACTIVE",
        deletedAt: null,
      },
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          type: true,
          name: true,
          email: true,
          phone: true,
          status: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError("Sessão inválida ou expirada", 401);
  }

  res.locals.user = session.user;
  res.locals.sessionId = session.id;

  next();
}