import { prisma } from "../../lib/prisma";

export async function listRoles() {
  const roles = await prisma.role.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      active: true,
      permissions: {
        select: {
          permission: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    active: role.active,
    permissions: role.permissions.map(
      (item) => item.permission,
    ),
  }));
}

export async function listPermissions() {
  return prisma.permission.findMany({
    select: {
      id: true,
      name: true,
      resource: true,
      action: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}