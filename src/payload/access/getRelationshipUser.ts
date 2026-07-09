import type { PayloadRequest } from "payload";

export const getRelationshipUser = (req: PayloadRequest) => {
  if (!req.user) return null;

  return {
    relationTo: req.user.collection === "admins" ? "admins" : "users",
    value: req.user.id,
  };
};
