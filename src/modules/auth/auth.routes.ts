import { Router } from "express";
import { successResponse } from "../../shared/http/response";
import { registerSchema } from "./auth.schemas";
import { registerUser } from "./auth.service";

export const authRoutes = Router();

authRoutes.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await registerUser(data);

  res.status(201).json(successResponse(user));
});