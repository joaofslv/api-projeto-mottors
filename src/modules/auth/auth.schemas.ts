import { z } from "zod";

export const registerSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]),
  name: z.string().trim().min(2, "Nome muito curto"),
  email: z.email("Email inválido").toLowerCase(),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
  phone: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;