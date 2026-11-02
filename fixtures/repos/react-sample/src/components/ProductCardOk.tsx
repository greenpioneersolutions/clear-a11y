// Correct pattern: meaningful alt text and a real button. Must produce no findings.
import type { Product } from './ProductCard';

export function ProductCardOk({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <article className="product-card">
      <img src={product.image} alt={`${product.name}, front view`} />
      <h3>{product.name}</h3>
      <button type="button" className="product-card__open" onClick={onOpen}>
        View details
      </button>
      <p>{product.price}</p>
    </article>
  );
}

export function DecorativeDivider() {
  return <img src="/divider.svg" alt="" />;
}
