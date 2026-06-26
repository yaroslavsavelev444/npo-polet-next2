// src/components/header/StickyHeader.tsx
import { Flex } from '@once-ui-system/core';
import { TopHeader } from './TopHeader';
import Navbar from './Navbar';
// import { Header } from './Header';

export const StickyHeader = () => {
  return (
    <Flex
      as="header"
      direction="column"
      fillWidth
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'transparent', // чтобы не перекрывать контент
      }}
    >
      <TopHeader />
       <Navbar />
    </Flex>
  );
};