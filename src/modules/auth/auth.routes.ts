import { authenticate } from "../../shared/middlewares/authenticate";
import { Router } from "express";
import { successResponse } from "../../shared/http/response";
import { loginSchema, registerSchema } from "./auth.schemas";
import { loginUser, registerUser } from "./auth.service";

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
