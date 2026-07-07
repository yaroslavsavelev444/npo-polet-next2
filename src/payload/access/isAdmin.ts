// src/payload/access/isAdmin.ts
import type { Access } from "payload";

export const isAdmin: Access = ({ req }) =>
  req.user?.collection === "admins" && req.user?.role === "admin";
