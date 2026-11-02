import { useEffect, useRef, useState } from 'react';

/**
 * Correct pattern (ARIA Authoring Practices "Modal Dialog"): named by its heading, focus moves to
 * the first control on open, Tab stays inside, Escape closes, focus returns to the opener.
 */
export function ModalOk() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return close();
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === first.current) {
        event.preventDefault();
        last.current?.focus();
      } else if (!event.shiftKey && document.activeElement === last.current) {
        event.preventDefault();
        first.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return (
    <div className="modal-demo">
      <button type="button" ref={opener} id="open-dialog" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Subscribe
      </button>
      <div className="backdrop" hidden={!open}>
        <div role="dialog" id="newsletter-dialog" aria-modal="true" aria-labelledby="newsletter-title">
          <h2 id="newsletter-title">Newsletter</h2>
          <label>
            Email <input type="email" ref={first} id="newsletter-email" autoComplete="email" />
          </label>
          <p>
            <button type="button" ref={last} id="close-dialog" onClick={close}>
              Close
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
