// Seeded barriers: image without alt text, clickable <div>, image with spread props and no alt.
import type { ImgHTMLAttributes } from 'react';

export interface Product {
  id: string;
  name: string;
  price: string;
  image: string;
}

export function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <article className="product-card">
      <img src={product.image} className="product-card__image" />
      <h3>{product.name}</h3>
      <div className="product-card__open" onClick={onOpen}>
        View details
      </div>
      <p>{product.price}</p>
    </article>
  );
}

export function ProductThumb(imageProps: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...imageProps} />;
}
