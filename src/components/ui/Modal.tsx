import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from './IconButton';
import { CloseModalContext } from './closeModal';
import type { CloseModal } from './closeModal';
import { cn } from '../../utils/cn';

type ModalSize = 'sm' | 'md';
/** How it comes in on a phone; from `sm` up both are a centred panel */
type ModalPlacement = 'sheet' | 'drawer';

interface ModalProps {
  title?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  /** Pinned below the scrolling body, e.g. the dialog's actions (which may use `useCloseModal`) */
  footer?: React.ReactNode;
  /** Adds a close button, Escape and click-outside; omit it when the dialog requires an explicit choice */
  onClose?: () => void;
  /** Unsaved edits: Escape and clicking outside are ignored so nothing is lost by accident */
  isDirty?: boolean;
  size?: ModalSize;
  placement?: ModalPlacement;
  bodyClassName?: string;
}

// --enter-translate is where it slides in from and back out to (modal-dialog in base.css)
const placementClasses: Record<ModalPlacement, string> = {
  // A bottom sheet that slides up, as tall as its content
  sheet: 'mb-0 h-fit max-h-[92dvh] rounded-t-xl rounded-b-none [--enter-translate:0_100%]',
  // A full-height panel that slides in from the left, clear of the notch
  drawer:
    'ml-0 my-0 h-dvh max-h-dvh w-[min(85vw,22rem)] rounded-r-xl rounded-l-none pt-[env(safe-area-inset-top)] [--enter-translate:-100%_0] sm:w-full sm:pt-0',
};

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
};

// Native light dismiss (closedby="any"); elsewhere a click on the <dialog> itself is a click on its backdrop
const supportsClosedBy = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

// Longer than the exit transition (150ms in base.css): a transition that never reports back must not keep
// the parent's onClose from running
const CLOSE_FALLBACK_MS = 300;

/** The exit transition close() just started, or null when nothing animates (reduced support, jsdom) */
function exitTransition(dialog: HTMLDialogElement): Promise<unknown> | null {
  // getAnimations() flushes style first, so it already sees the transitions close() triggered
  const animations = typeof dialog.getAnimations === 'function' ? dialog.getAnimations() : [];
  if (animations.length === 0) {
    return null;
  }
  return Promise.allSettled(animations.map((animation) => animation.finished));
}

/**
 * A native <dialog> opened with showModal(): top layer, inert page behind it, focus handled by the browser.
 * A centred panel from `sm` up; below that a bottom sheet, or with `placement="drawer"` a full-height panel
 * from the left. Header and footer stay put while the body scrolls.
 */
export const Modal: React.FC<ModalProps> = ({
  title = '',
  icon: Icon,
  children,
  footer,
  onClose,
  isDirty = false,
  size = 'sm',
  placement = 'sheet',
  bodyClassName,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Set while the exit animation plays: a second close (double click, Escape) must not call back twice
  const closeTimerRef = useRef<number | undefined>(undefined);
  const titleId = useId();
  const isDismissable = !!onClose && !isDirty;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }, []);

  // Unmounted mid-animation (the parent closed it some other way): nothing left to call back
  useEffect(
    () => () => {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    },
    []
  );

  // The parent unmounts the dialog, which would cut the exit animation, so it hears back only once that has played
  const close: CloseModal = (then = onClose) => {
    const dialog = dialogRef.current;
    if (!then || !dialog || closeTimerRef.current !== undefined) {
      return;
    }
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    const exit = exitTransition(dialog);
    if (!exit) {
      then();
      return;
    }
    const finish = () => {
      if (closeTimerRef.current === undefined) {
        return;
      }
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
      then();
    };
    closeTimerRef.current = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    void exit.then(finish);
  };

  // Escape and native light dismiss arrive as `cancel`; the parent decides by unmounting
  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (isDismissable) {
      close();
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (!supportsClosedBy && isDismissable && event.target === event.currentTarget) {
      close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleClick}
      {...{ closedby: isDismissable ? 'any' : 'none' }}
      className={cn(
        'modal-dialog open:flex flex-col m-auto p-0 w-full max-w-none text-text-1 bg-surface-1 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-xs',
        placementClasses[placement],
        // sm and up: centred panel; a modal dialog is fixed to inset 0, so auto height would stretch it
        'sm:m-auto sm:h-fit sm:max-h-[85vh] sm:rounded-2xl sm:border sm:border-border-2 sm:[--enter-translate:0_0.5rem]',
        sizeClasses[size]
      )}
    >
      {/* The sheet's grab handle: a familiar cue that it closes by going back down */}
      {placement === 'sheet' && <div aria-hidden="true" className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-border-3" />}

      {(Icon || title) && <header className="shrink-0 flex items-center gap-2 px-5 pt-3 pb-3 sm:px-6 sm:pt-5 sm:pb-4 border-b border-border-1">
        {Icon && <Icon className="w-5 h-5 shrink-0 text-brand-500" />}
        <h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold text-text-1">
          {title}
        </h2>
        {onClose && (
          <IconButton title="Close" size="sm" onClick={() => close()} className="-mr-2">
            <X className="w-5 h-5" />
          </IconButton>
        )}
      </header>}

      {!Icon && !title &&  onClose && (
        <IconButton title="Close" size="sm" onClick={() => close()} className="absolute right-0 top-0">
          <X className="w-5 h-5" />
        </IconButton>
      )}

      <CloseModalContext.Provider value={close}>
        <div className="scroll-fade flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className={cn('px-6 py-5', bodyClassName)}>{children}</div>
        </div>

        {footer && (
          <footer className="shrink-0 flex items-center justify-end gap-3 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-border-1">
            {footer}
          </footer>
        )}
      </CloseModalContext.Provider>
    </dialog>
  );
};
