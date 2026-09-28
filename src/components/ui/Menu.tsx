import React, { createContext, useContext, useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './IconButton';

const CloseMenuContext = createContext<() => void>(() => {});

interface MenuProps {
  /** Names the trigger (tooltip and accessible name) */
  title: string;
  icon: LucideIcon;
  /** CSS anchor name tying the menu to its trigger, e.g. "--link-menu"; unique per page */
  anchorName: string;
  triggerClassName?: string;
  children: React.ReactNode;
}

/**
 * A menu on the native Popover API, so clicking outside or pressing Escape closes it without extra code.
 * It drops down under its trigger on wider screens and opens as an action sheet on phones (menu-popover
 * in base.css).
 */
export const Menu: React.FC<MenuProps> = ({ title, icon: Icon, anchorName, triggerClassName, children }) => {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => menuRef.current?.hidePopover?.();

  return (
    <>
      <IconButton
        title={title}
        aria-label={title}
        popoverTarget={menuId}
        style={{ anchorName } as React.CSSProperties}
        className={triggerClassName}
      >
        <Icon className="w-4 h-4" />
      </IconButton>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        style={{ positionAnchor: anchorName } as React.CSSProperties}
        className="menu-popover p-1 bg-surface-1 text-text-1 border border-border-2 shadow-lg"
      >
        <CloseMenuContext.Provider value={close}>{children}</CloseMenuContext.Provider>
      </div>
    </>
  );
};

interface MenuItemProps {
  icon: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  children: React.ReactNode;
  'data-testid'?: string;
}

/** One action in a Menu; choosing it closes the menu first. */
export const MenuItem: React.FC<MenuItemProps> = ({ icon: Icon, onSelect, tone = 'default', disabled, children, 'data-testid': testId }) => {
  const closeMenu = useContext(CloseMenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        closeMenu();
        onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-3 sm:py-2 text-base sm:text-sm text-left transition-colors hover:bg-surface-2 disabled:opacity-40',
        tone === 'danger' ? 'text-text-danger-1 hover:bg-surface-danger-1' : 'text-text-2'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {children}
    </button>
  );
};
