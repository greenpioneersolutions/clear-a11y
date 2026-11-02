// Correct pattern: actions are buttons, navigation is a link with a real href.
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function HelpLink() {
  return (
    <a href="/help" className="icon-button">
      Help
    </a>
  );
}
