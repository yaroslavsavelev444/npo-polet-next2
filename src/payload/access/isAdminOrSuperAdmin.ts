// src/payload/access/isAdminOrSuperAdmin.ts
import type { Access } from "payload";

export const isAdminOrSuperAdmin: Access = ({ req }) =>
  req.user?.collection === "admins" &&
  ["admin", "superadmin"].includes(req.user?.role ?? "");
