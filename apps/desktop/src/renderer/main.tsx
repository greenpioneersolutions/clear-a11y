import { render } from 'preact';
import { getApi } from './api.js';
import { App } from './app.js';

const root = document.getElementById('app');
const api = getApi();
if (root) {
  if (api) {
    render(<App api={api} />, root);
  } else {
    render(
      <main id="main">
        <h1>Clear A11Y could not start</h1>
        <p>
          The connection to the app is missing. Restart Clear A11Y. If this keeps happening, report
          it with the steps that led here.
        </p>
      </main>,
      root,
    );
  }
}
