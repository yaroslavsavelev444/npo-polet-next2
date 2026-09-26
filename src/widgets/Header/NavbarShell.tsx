import { Flex } from "@once-ui-system/core";
import type { Category, Setting, User } from "@/payload-types"; // или твой тип пользователя
import type { CatalogMenuData } from "./catalog-menu";
import NavbarClientIsland from "./NavbarClientIsland";

interface Props {
  user: User | null;
  categories: Category[];
  catalogMenu: CatalogMenuData;
  settings: Setting | null;
  cartItemCount: number;
  cartProductIds: string[];
  wishlistProductIds: string[];
  unreadNotificationCount: number;
  cartOnboardingSeen: boolean;
}

export default function NavbarShell({
  user,
  categories,
  catalogMenu,
  settings,
  cartItemCount,
  cartProductIds,
  wishlistProductIds,
  unreadNotificationCount,
  cartOnboardingSeen,
}: Props) {
  return (
    <Flex
      as="header"
      fillWidth
      vertical="center"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "12px 24px",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        backgroundColor: "var(--header-glass)",
        borderBottom:
          "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
      }}
    >
      <Flex
        fillWidth
        horizontal="between"
        vertical="center"
        style={{ maxWidth: "1400px" }}
      >
        <NavbarClientIsland
          user={user}
          categories={categories}
          catalogMenu={catalogMenu}
          settings={settings}
          cartItemCount={cartItemCount}
          cartProductIds={cartProductIds}
          wishlistProductIds={wishlistProductIds}
          unreadNotificationCount={unreadNotificationCount}
          cartOnboardingSeen={cartOnboardingSeen}
        />
      </Flex>
    </Flex>
  );
}
