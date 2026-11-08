import { hash } from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../shared/errors/AppError";
import type { RegisterInput } from "./auth.schemas";

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