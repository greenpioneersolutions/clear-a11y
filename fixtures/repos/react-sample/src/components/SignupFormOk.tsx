// Correct pattern: every label points at its control, natural tab order, no autofocus.
export function SignupFormOk({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form id="signup-ok" onSubmit={onSubmit}>
      <label htmlFor="signup-ok-email">Email address</label>
      <input id="signup-ok-email" type="email" name="email" autoComplete="email" />
      <label>
        Full name
        <input type="text" name="name" autoComplete="name" />
      </label>
      <button type="submit">Sign up</button>
    </form>
  );
}
