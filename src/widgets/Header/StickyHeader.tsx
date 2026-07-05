// src/widgets/Header/StickyHeader.tsx
import { Flex } from "@once-ui-system/core";
import Navbar from "./Navbar";
import TopHeader from "./TopHeader";

export const StickyHeader = () => {
  return (
    <Flex
      as="header"
      direction="column"
      fillWidth
      style={{
        position: "fixed",

        inset: "0 0 auto 0",

        zIndex: 20,
        background: "transparent",
      }}
    >
      <TopHeader />
      <Navbar />
    </Flex>
  );
};
