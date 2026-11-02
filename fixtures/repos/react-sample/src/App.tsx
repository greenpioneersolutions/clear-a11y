// Correct pattern: the app shell itself has no barriers; the seeded ones live in components.
import { CloseLink, MoreLink } from './components/IconButton';
import { ProductCard, type Product } from './components/ProductCard';
import { SignupForm } from './components/SignupForm';

const product: Product = { id: 'p1', name: 'Trail shoe', price: '$89', image: '/shoe.png' };

export function App() {
  return (
    <main>
      <h1>Sample shop</h1>
      <ProductCard product={product} onOpen={() => undefined} />
      <SignupForm onSubmit={() => undefined} />
      <nav aria-label="Dialog actions" data-testid="dialog-actions">
        <CloseLink onClose={() => undefined} />
        <MoreLink onMore={() => undefined} />
      </nav>
    </main>
  );
}
