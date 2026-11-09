import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

const prisma = new PrismaClient();

const adminSchema = z.object({
  name: z.string().trim().min(2),
  email: z.email().toLowerCase(),
  password: z.string().min(12),
});

async function main() {
  const result = adminSchema.safeParse({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  if (!result.success) {
    throw new Error(
      "Informe ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD. " +
      "A senha precisa ter pelo menos 12 caracteres.",
    );
  }

  const input = result.data;
  const passwordHash = await hash(input.password, 12);

  await prisma.$transaction(
    async (tx) => {
      const role = await tx.role.findUnique({
        where: {
          name: "SUPER_ADMIN",
        },
      });

      if (!role || !role.active || role.deletedAt) {
        throw new Error(
          "O perfil SUPER_ADMIN não existe ou está indisponível.",
        );
      }

      const existingAdmin = await tx.userRole.findFirst({
        where: {
          roleId: role.id,
          user: {
            type: "INTERNAL",
            status: "ACTIVE",
            deletedAt: null,
          },
        },
      });

      if (existingAdmin) {
        throw new Error(
          "Já existe um administrador inicial. " +
          "Use o gerenciamento administrativo para criar outros.",
        );
      }

      const existingUser = await tx.user.findUnique({
        where: {
          email: input.email,
        },
      });

      if (existingUser) {
        throw new Error(
          "Email já cadastrado. Use um email exclusivo para a conta administrativa.",
        );
      }

      await tx.user.create({
        data: {
          type: "INTERNAL",
          name: input.name,
          email: input.email,
          password: passwordHash,
          status: "ACTIVE",
          roles: {
            create: {
              roleId: role.id,
            },
          },
        },
      });
    },
    {
      isolationLevel: "Serializable",
    },
  );

  console.log("Administrador inicial criado com sucesso.");
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Falha ao criar administrador.",
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });