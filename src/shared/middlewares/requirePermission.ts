import type { Request, Response, NextFunction } from "express";

import { prisma } from "../../lib/prisma";
import { AppError } from "../errors/AppError";

export function requirePermission(permissionName: string) {
  return async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const userId = res.locals.user?.id;

    if (!userId) {
      throw new AppError("Autenticação obrigatória", 401);
    }

    const assignment = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          active: true,
          deletedAt: null,
          permissions: {
            some: {
              permission: {
                name: permissionName,
              },
            },
          },
        },
      },
      select: {
        userId: true,
      },
    });

    if (!assignment) {
      throw new AppError("Você não tem permissão para esta ação", 403);
    }

    next();
  };
}