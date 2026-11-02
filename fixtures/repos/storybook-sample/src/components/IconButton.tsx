export interface IconButtonProps {
  id?: string;
  /** Accessible name. Optional in the API, which is the bug: a story renders it without one. */
  label?: string;
  onClick?: () => void;
}

export function IconButton({ id, label, onClick }: IconButtonProps) {
  return (
    <button
      id={id}
      type="button"
      className="icon-button"
      data-testid="icon-button"
      aria-label={label}
      onClick={onClick}
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  );
}
