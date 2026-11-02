// Seeded barriers: label not associated with its input, autofocus, positive tabIndex.
export function SignupForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form id="signup" onSubmit={onSubmit}>
      <label className="field-label">Email address</label>
      <input id="signup-email" type="email" name="email" autoFocus />
      <label htmlFor="signup-name">Full name</label>
      <input id="signup-name" type="text" name="name" />
      <button type="submit" tabIndex={3}>
        Sign up
      </button>
    </form>
  );
}
