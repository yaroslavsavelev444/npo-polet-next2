// src/widgets/Header/StickyHeader.tsx
import { Flex } from "@once-ui-system/core";
import Navbar from "./Navbar";
import TopHeader from "./TopHeader";

export const StickyHeader = () => {
  return (
    /* data-sticky-header — точка привязки для мобильного меню: панель
       начинается ровно под шапкой и меряет её реальную высоту. Токен
       --sticky-header-height для этого не годится — он задан «на глаз»
       (124px при sm+ против фактических ~96px, 72px против ~63px на
       мобильных), и по нему между шапкой и панелью оставалась полоса
       просвечивающей страницы. */
    <Flex
      as="header"
      direction="column"
      fillWidth
      data-sticky-header
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
