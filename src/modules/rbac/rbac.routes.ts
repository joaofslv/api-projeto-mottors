import { Router } from "express";

import { successResponse } from "../../shared/http/response";
import { authenticate } from "../../shared/middlewares/authenticate";
import { requirePermission } from "../../shared/middlewares/requirePermission";
import { listPermissions, listRoles } from "./rbac.service";

export const rbacRoutes = Router();

rbacRoutes.get(
  "/roles",
  authenticate,
  requirePermission("roles.manage"),
  async (_req, res) => {
    const roles = await listRoles();

    res.json(successResponse(roles));
  },
);

rbacRoutes.get(
  "/permissions",
  authenticate,
  requirePermission("roles.manage"),
  async (_req, res) => {
    const permissions = await listPermissions();

    res.json(successResponse(permissions));
  },
);