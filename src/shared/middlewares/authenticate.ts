import type { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError } from "../errors/AppError";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
  if (!match) throw new AppError("Token de acesso obrigatório", 401);

  let userId: string;
  try {
    const payload = verify(match[1], env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "api-projeto-mottors",
      audience: "mottors-api",
    });
    if (typeof payload === "string" || typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Token sem usuário");
    }
    userId = payload.sub;
  } catch {
    throw new AppError("Token inválido ou expirado", 401);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletedAt: null },
    select: { id: true, type: true, name: true, email: true, phone: true, status: true },
  });
  if (!user) throw new AppError("Usuário indisponível", 401);
  res.locals.user = user;
  next();
}
