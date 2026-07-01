// Types
export type * from "./types/profile.types";

// Components (client)
export { ProfileClient }      from "./components/ProfileClient";
export { AccountTab }         from "./components/AccountTab";
export { SecurityTab }        from "./components/SecurityTab";
export { SessionsTab }        from "./components/SessionsTab";
export { SessionCard }        from "./components/SessionCard";
export { ProfileTabs }        from "./components/ProfileTabs";
export { LogoutConfirmModal } from "./components/LogoutConfirmModal";

// Server Actions (never import on client directly — pass as props)
export {
  updateAccountAction,
  changePasswordAction,
  revokeSessionAction,
  refreshSessionsAction,
  logoutAction,
} from "./actions";