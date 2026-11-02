export interface CardProps {
  title: string;
  price: string;
  note: string;
  /** "muted" renders the note in light grey: 2.3:1 on white, below the 4.5:1 minimum (1.4.3). */
  tone?: 'default' | 'muted';
}

export function Card({ title, price, note, tone = 'default' }: CardProps) {
  return (
    <article className="card">
      <h3>{title}</h3>
      <p className="card-price">{price}</p>
      <p className={tone === 'muted' ? 'card-note card-note-muted' : 'card-note'}>{note}</p>
    </article>
  );
}
