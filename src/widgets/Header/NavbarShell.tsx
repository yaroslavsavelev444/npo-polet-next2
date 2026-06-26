import { Flex } from '@once-ui-system/core';
import NavbarClientIsland from './NavbarClientIsland';
import type { Category, Setting } from '@/payload-types';
import type { User } from '@/payload-types'; // или твой тип пользователя

interface NavbarShellProps {
  user: User | null;
  categories: Category[];
  settings: Setting | null;
}


export default function NavbarShell({ user, categories, settings }: NavbarShellProps) {
  return (
    <Flex
      as="header"
      fillWidth
      vertical="center"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '12px 24px',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        backgroundColor: 'rgba(10, 12, 16, 0.75)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Flex
        fillWidth
        horizontal="between"
        vertical="center"
        style={{ maxWidth: '1400px' }}
      >
        <NavbarClientIsland
          user={user}
          categories={categories}
          settings={settings}
        />
      </Flex>
    </Flex>
  );
}