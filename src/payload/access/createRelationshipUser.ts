export function createRelationshipUser(
  relationTo: "users" | "admins",
  id: number | string,
) {
  return {
    relationTo,
    value: Number(id),
  };
}
