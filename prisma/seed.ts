import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissions = [
  {
    name: "users.view",
    resource: "users",
    action: "view",
  },
  {
    name: "users.update",
    resource: "users",
    action: "update",
  },
  {
    name: "roles.manage",
    resource: "roles",
    action: "manage",
  },
  {
    name: "catalog.manage",
    resource: "catalog",
    action: "manage",
  },
  {
    name: "ads.moderate",
    resource: "ads",
    action: "moderate",
  },
  {
    name: "plans.manage",
    resource: "plans",
    action: "manage",
  },
  {
    name: "billing.view",
    resource: "billing",
    action: "view",
  },
  {
    name: "content.manage",
    resource: "content",
    action: "manage",
  },
];

const roles = [
  {
    name: "SUPER_ADMIN",
    description: "Super Administrador",
    permissions: permissions.map((permission) => permission.name),
  },
  {
    name: "ADMIN",
    description: "Administrador",
    permissions: [
      "users.view",
      "users.update",
      "catalog.manage",
      "ads.moderate",
      "plans.manage",
      "billing.view",
      "content.manage",
    ],
  },
  {
    name: "MODERATOR",
    description: "Moderador",
    permissions: [
      "users.view",
      "ads.moderate",
    ],
  },
  {
    name: "FINANCE",
    description: "Financeiro",
    permissions: ["billing.view"],
  },
  {
    name: "SUPPORT",
    description: "Atendimento",
    permissions: ["users.view"],
  },
  {
    name: "CONTENT_EDITOR",
    description: "Editor de Conteúdo",
    permissions: ["content.manage"],
  },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const permission of permissions) {
      await tx.permission.upsert({
        where: {
          name: permission.name,
        },
        update: {},
        create: permission,
      });
    }

    for (const definition of roles) {
      const role = await tx.role.upsert({
        where: {
          name: definition.name,
        },
        update: {},
        create: {
          name: definition.name,
          description: definition.description,
        },
      });

      // Preserva perfis desativados ou removidos.
      if (!role.active || role.deletedAt) {
        continue;
      }

      for (const permissionName of definition.permissions) {
        const permission = await tx.permission.findUniqueOrThrow({
          where: {
            name: permissionName,
          },
        });

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  });

  console.log("Perfis e permissões iniciais criados.");
}

main()
  .catch((error) => {
    console.error("Falha ao executar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });