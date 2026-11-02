import { useState } from 'react';

/**
 * Seeded barrier: opening the dialog leaves focus on the button behind it, and closing it drops
 * focus on <body> (2.4.3). The wrapper carries the Clear A11Y source attribute a dev-build
 * Babel/SWC plugin would add, so runtime findings map back to this file.
 */
export function Modal() {
  const [open, setOpen] = useState(false);
  return (
    <div className="modal-demo" data-clear-a11y-src="src/components/Modal.tsx:11">
      <button type="button" id="open-dialog" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Subscribe
      </button>
      <div className="backdrop" hidden={!open}>
        <div role="dialog" id="newsletter-dialog" aria-modal="true" aria-labelledby="newsletter-title">
          <h2 id="newsletter-title">Newsletter</h2>
          <label>
            Email <input type="email" id="newsletter-email" autoComplete="email" />
          </label>
          <p>
            <button type="button" id="close-dialog" onClick={() => setOpen(false)}>
              Close
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
