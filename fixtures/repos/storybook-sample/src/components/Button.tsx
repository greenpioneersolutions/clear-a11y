import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
}

/** Correct pattern: a native button with visible text. */
export function Button({ children, onClick }: ButtonProps) {
  return (
    <button type="button" className="button-primary" onClick={onClick}>
      {children}
    </button>
  );
}
