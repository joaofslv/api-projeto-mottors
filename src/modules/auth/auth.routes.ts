import { authenticate } from "../../shared/middlewares/authenticate";
import { Router } from "express";
import { successResponse } from "../../shared/http/response";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schemas";
import { loginUser,logoutSession, refreshSession, registerUser } from "./auth.service";
import { requirePermission } from "../../shared/middlewares/requirePermission";

export const authRoutes = Router();

authRoutes.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await registerUser(data);

  res.status(201).json(successResponse(user));
});

authRoutes.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  res.json(successResponse(await loginUser(input)));
});

authRoutes.get("/me", authenticate, (_req, res) => {
  res.json(successResponse(res.locals.user));
});

authRoutes.post("/refresh", async (req, res) => {
  const input = refreshSchema.parse(req.body);
  const tokens = await refreshSession(input);

  res.json(successResponse(tokens));
});

authRoutes.post("/logout", authenticate, async (_req, res) => {
  await logoutSession(
    res.locals.sessionId,
    res.locals.user.id,
  );

  res.json(successResponse({
    message: "Sessão encerrada",
  }));
});
authRoutes.get(
  "/permission-check",
  authenticate,
  requirePermission("users.view"),
  (_req, res) => {
    res.json(
      successResponse({
        message: "Você possui a permissão users.view",
      }),
    );
  },
);