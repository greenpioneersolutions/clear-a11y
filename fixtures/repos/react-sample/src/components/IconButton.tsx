// Seeded barriers: anchors used as buttons (no href, and href="#").
export function CloseLink({ onClose }: { onClose: () => void }) {
  return (
    <a className="icon-button" onClick={onClose}>
      Close
    </a>
  );
}

export function MoreLink({ onMore }: { onMore: () => void }) {
  return (
    <a href="#" className="icon-button" onClick={onMore}>
      More options
    </a>
  );
}
