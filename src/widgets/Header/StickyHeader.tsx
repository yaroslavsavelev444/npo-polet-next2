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

        // Слои (снизу вверх): страница и её липкие полосы — до 40 (панель
        // фильтров каталога 30, док оформления заказа 40); затемнение меню
        // шапки 43, шторка меню 44, сама шапка 45, полоса прогресса главной
        // 46; модальные слои — от 50 (Drawer, cookie-баннер 60, мобильное
        // меню 70, корзина 80). Шапка обязана быть выше липких полос
        // страниц: всё, что из неё выпадает (меню «Каталог», колокольчик,
        // меню пользователя), живёт в её контексте наложения и при 20
        // уходило под панель фильтров каталога.
        zIndex: 45,
        background: "transparent",
      }}
    >
      <TopHeader />
      <Navbar />
    </Flex>
  );
};
