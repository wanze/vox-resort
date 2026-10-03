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
        className="hud-option hud-menu-back"
        role="menuitem"
        onClick={onBack}
      >
        <span className="hud-option-icon hud-menu-back-mark" aria-hidden="true">
          ‹
        </span>
        <span className="hud-option-text">
          <span className="hud-option-label">{title}</span>
        </span>
      </button>
      {children}
    </>
  );
}
