import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuPageProps {
  readonly title: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

// The row that opened the page is gone, so the keyboard lands on the way back out.
export function MenuPage({ title, onBack, children }: MenuPageProps) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), []);

  return (
    <>
      <button
        ref={back}
        type="button"
        className="ui-option hud-menu-back"
        role="menuitem"
        tabIndex={-1}
        onClick={onBack}
      >
        <span className="hud-menu-back-mark" aria-hidden="true">
          ‹
        </span>
        <span className="ui-option-text">
          <span className="ui-option-label">{title}</span>
        </span>
      </button>
      {children}
    </>
  );
}
