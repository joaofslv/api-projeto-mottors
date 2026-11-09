import { authRoutes } from "./modules/auth/auth.routes";
import { prisma } from "./lib/prisma";
import { AppError } from "./shared/errors/AppError";
import express from "express";
import { errorHandler } from "./shared/middlewares/errorHandler";
import { notFound } from "./shared/middlewares/notFound";
import { successResponse } from "./shared/http/response";
import { rbacRoutes } from "./modules/rbac/rbac.routes";

export const app = express();


app.use(express.json());
app.use("/auth", authRoutes);
app.use(rbacRoutes);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError("Banco de dados indisponível", 503);
  }

  res.json(successResponse({ status: "ok" }));
});

// sempre por último, nesta ordem:
app.use(notFound);
app.use(errorHandler);