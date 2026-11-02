// Seeded barrier hidden behind a lint-disable comment: Clear A11Y ignores inline lint config,
// so an audit still reports it.
export function Banner() {
  return (
    <section className="banner">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src="/banner.png" />
    </section>
  );
}
