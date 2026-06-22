import type { Access } from 'payload'

export const isLoggedIn: Access = ({ req }) => {
  return Boolean(req.user)
}