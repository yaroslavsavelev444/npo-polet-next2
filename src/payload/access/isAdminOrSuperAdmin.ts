// src/payload/access/isAdminOrSuperAdmin.ts
import type { Access } from "payload";

export const isAdminOrSuperAdmin: Access = ({ req }) => {
  console.log("ACCESS CHECK", req.user);

  return (
    req.user?.collection === "admins" &&
    ["admin", "superadmin"].includes(req.user.role ?? "")
  );
};
