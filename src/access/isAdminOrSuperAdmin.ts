import type { Access } from 'payload'

export const isAdminOrSuperAdmin: Access = ({ req }) => {
  return ['admin', 'superadmin'].includes(req.user?.role ?? '')
}