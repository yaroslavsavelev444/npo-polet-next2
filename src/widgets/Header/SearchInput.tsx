'use client';

import { Loader2, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { RemoveScroll } from 'react-remove-scroll';
import {
  flattenSections,
  moveActiveKey,
  optionId,
  resolveEnterTarget,
  SearchPanel,
  type SearchResultType,
  useSiteSearch,
} from '@/modules/search';
import { useClickOutside } from '@/shared/hooks/useClickOutside';
import { useSearchStore } from '@/shared/store/search.store';
import { cn } from '@/utils/cn';

interface Props {
  /**
   * desktop — поле в шапке и выпадающая панель под ним (от md);
   * mobile — кнопка-лупа, открывающая поиск на весь экран (до md).
   * Один и тот же поиск: общий стор, общий запрос, общая панель выдачи.
   */
  variant?: 'desktop' | 'mobile';
}

const RESULTS_ID = 'header-search-results';

/** Ширина выпадающей панели: шире поля — выдаче нужно место под фото, цену и фрагменты. */
const PANEL_WIDTH = 'min(44rem, calc(100vw - 2rem))';
/** Отступ панели от краёв окна. */
const VIEWPORT_GUTTER = 16;

/**
 * Управление поиском, общее для обоих вариантов: запрос, клавиатура, выбор.
 */
function useSearchController(onDone?: () => void) {
  const router = useRouter();
  const query = useSearchStore((s) => s.query);
  const activeKey = useSearchStore((s) => s.activeKey);
  const setActiveKey = useSearchStore((s) => s.setActiveKey);
  const reset = useSearchStore((s) => s.reset);

  const search = useSiteSearch(query);
  const entries = flattenSections(search.sections);

  const handleSelect = useCallback(() => {
    reset();
    onDone?.();
  }, [reset, onDone]);

  const handleLoadMore = useCallback(
    (type: SearchResultType, offset: number) => {
      void search.loadMore(type, offset);
    },
    [search],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (entries.length === 0) return;
      event.preventDefault();
      const next = moveActiveKey(entries, activeKey, event.key === 'ArrowDown' ? 1 : -1);
      setActiveKey(next);
      if (next) {
        document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (event.key === 'Enter') {
      // Enter ведёт прямо к результату — выделенному, а без выделения к
      // первому. Страницы «все результаты» нет, поэтому без выдачи Enter
      // ничего не делает, а не уводит в пустоту.
      const target = resolveEnterTarget(entries, activeKey);
      if (!target) return;
      event.preventDefault();
      if (target.kind === 'more') {
        handleLoadMore(target.type, target.offset);
        return;
      }
      router.push(target.href);
      handleSelect();
    }
  };

  return {
    query,
    activeKey,
    setActiveKey,
    search,
    handleSelect,
    handleLoadMore,
    handleKeyDown,
  };
}

export default function SearchInput({ variant = 'desktop' }: Props) {
  return variant === 'mobile' ? <MobileSearch /> : <DesktopSearch />;
}

// ── Desktop ───────────────────────────────────────────────────────────────

function DesktopSearch() {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isOpen = useSearchStore((s) => s.isOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const open = useSearchStore((s) => s.open);
  const close = useSearchStore((s) => s.close);
  const reset = useSearchStore((s) => s.reset);

  const { query, activeKey, setActiveKey, search, handleSelect, handleLoadMore, handleKeyDown } =
    useSearchController();

  useClickOutside([containerRef, panelRef], close, isOpen);

  const trimmed = query.trim();
  const showPanel = isOpen && trimmed.length > 0;
  const panelStyle = usePanelPosition(containerRef, showPanel);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      event.currentTarget.blur();
      return;
    }
    // Заново открыть закрытую Escape-ом панель можно стрелкой вниз — как у
    // любого выпадающего списка.
    if (!isOpen && event.key === 'ArrowDown') open();
    handleKeyDown(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !(containerRef.current?.contains(next) || panelRef.current?.contains(next))) {
      close();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-[420px]">
      <SearchField
        inputId={inputId}
        inputRef={inputRef}
        query={query}
        expanded={showPanel}
        activeKey={activeKey}
        busy={search.isLoading || search.isStale || search.loadingMore !== null}
        onChange={(value) => {
          setQuery(value);
          // Не только по фокусу: после выбора результата или Escape поле
          // остаётся в фокусе, и новый ввод обязан снова раскрыть панель.
          open();
        }}
        onFocus={open}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        onClear={() => {
          reset();
          inputRef.current?.focus();
        }}
      />

      {/* Панель выносится порталом в body: так она не обрезается шапкой и
          ложится поверх шторки меню. Шапка — fixed, z-index 45, см. шкалу
          слоёв в StickyHeader.tsx; панель — 47, над шапкой и полосой
          прогресса главной. */}
      {showPanel &&
        panelStyle &&
        createPortal(
          <div ref={panelRef} className="fixed z-[47]" style={panelStyle}>
            <SearchPanel
              id={RESULTS_ID}
              variant="dropdown"
              query={trimmed}
              search={search}
              activeKey={activeKey}
              onHover={setActiveKey}
              onSelect={handleSelect}
              onLoadMore={handleLoadMore}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Где стоит панель. Она шире поля и центрирована под ним — но поле стоит не
 * посреди окна (слева логотип, справа значки), и на планшетной ширине
 * центрированная панель вылезла бы за край. Поэтому позиция считается по
 * месту: по центру поля, но не ближе VIEWPORT_GUTTER к краям окна.
 *
 * Координаты — окна, а не страницы: панель fixed, как и шапка, поэтому
 * прокрутка её не сдвигает. Пересчёт нужен только при изменении размеров —
 * окна или самой шапки (верхняя строка шапки меняет высоту на разных
 * ширинах).
 */
function usePanelPosition(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
): CSSProperties | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = Math.min(44 * rem, viewport - 2 * rem);
      const centered = rect.left + (rect.width - width) / 2;
      const left = Math.min(
        Math.max(centered, VIEWPORT_GUTTER),
        viewport - VIEWPORT_GUTTER - width,
      );
      setPosition({ top: rect.bottom + 8, left });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [active, containerRef]);

  if (!active || !position) return null;
  return { top: position.top, left: position.left, width: PANEL_WIDTH };
}

// ── Mobile ────────────────────────────────────────────────────────────────

/**
 * На телефоне выпадающая панель под полем не работает: поля в шапке нет
 * (места хватает только на значки), а под открытой клавиатурой остаётся
 * половина экрана. Поэтому лупа открывает поиск на весь экран — поле
 * сверху, выдача под ним с прокруткой, «Отмена» справа, как в системном
 * поиске iOS и Android. Логика та же, что на desktop: общий хук, общая
 * панель, тот же ответ сервера.
 */
function MobileSearch() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);

  const setQuery = useSearchStore((s) => s.setQuery);

  // Открытость мобильной панели — её собственное состояние, а не isOpen из
  // стора: тот принадлежит выпадающей панели desktop (она смонтирована и
  // здесь, просто скрыта), и общий флаг раскрыл бы её вместе с этой.
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const { query, activeKey, setActiveKey, search, handleSelect, handleLoadMore, handleKeyDown } =
    useSearchController(() => setSheetOpen(false));

  // Шапка переходит на desktop-вёрстку — мобильная панель там не нужна.
  useEffect(() => {
    if (!isSheetOpen) return;
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeSheet();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [isSheetOpen, closeSheet]);

  useEffect(() => {
    if (isSheetOpen) inputRef.current?.focus();
  }, [isSheetOpen]);

  const trimmed = query.trim();

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    handleKeyDown(event);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Поиск"
        aria-haspopup="dialog"
        aria-expanded={isSheetOpen}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--text-primary)] transition-colors hover:bg-[var(--text-primary)]/10"
      >
        <Search size={18} aria-hidden />
      </button>

      {isSheetOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <RemoveScroll enabled removeScrollBar={false}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Поиск по сайту"
              className="fixed inset-0 z-[60] flex flex-col bg-[var(--surface)] animate-[dropdown-in_150ms_ease-out]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--text-primary)]/10 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="min-w-0 flex-1">
                  <SearchField
                    inputId={inputId}
                    inputRef={inputRef}
                    query={query}
                    expanded={trimmed.length > 0}
                    activeKey={activeKey}
                    busy={search.isLoading || search.isStale || search.loadingMore !== null}
                    onChange={setQuery}
                    onKeyDown={onKeyDown}
                    onClear={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="shrink-0 px-2 py-2 text-sm font-medium text-[color:var(--text-primary)]/70"
                >
                  Отмена
                </button>
              </div>

              <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
                {trimmed.length > 0 ? (
                  <SearchPanel
                    id={RESULTS_ID}
                    variant="sheet"
                    query={trimmed}
                    search={search}
                    activeKey={activeKey}
                    onHover={setActiveKey}
                    onSelect={handleSelect}
                    onLoadMore={handleLoadMore}
                    className="h-full"
                  />
                ) : (
                  <p className="px-6 py-10 text-center text-sm text-[color:var(--text-primary)]/50">
                    Товары, статьи базы знаний и ответы на частые вопросы
                  </p>
                )}
              </div>
            </div>
          </RemoveScroll>,
          document.body,
        )}
    </>
  );
}

// ── Поле ввода ────────────────────────────────────────────────────────────

interface SearchFieldProps {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  expanded: boolean;
  activeKey: string | null;
  busy: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

function SearchField({
  inputId,
  inputRef,
  query,
  expanded,
  activeKey,
  busy,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onClear,
}: SearchFieldProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/5',
        'px-4 py-2.5 backdrop-blur-xl transition-all',
        'focus-within:border-[var(--text-primary)]/25 focus-within:bg-[var(--text-primary)]/[0.07]',
      )}
    >
      <Search size={18} className="shrink-0 text-[color:var(--text-muted)]" aria-hidden />

      <label htmlFor={inputId} className="sr-only">
        Поиск по сайту
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={RESULTS_ID}
        aria-autocomplete="list"
        aria-activedescendant={expanded && activeKey ? optionId(activeKey) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder="Товары, статьи, вопросы…"
        className={cn(
          // 16px на телефоне: при меньшем кегле iOS увеличивает страницу при
          // фокусе на поле.
          'min-w-0 flex-1 border-none bg-transparent text-base text-[color:var(--text-primary)] outline-none md:text-sm',
          'placeholder:text-[color:var(--text-muted)]',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />

      {busy && query.trim().length > 0 && (
        <Loader2 size={16} className="shrink-0 animate-spin text-[color:var(--text-muted)]" aria-hidden />
      )}

      {!busy && query.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Очистить поиск"
          className="shrink-0 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
