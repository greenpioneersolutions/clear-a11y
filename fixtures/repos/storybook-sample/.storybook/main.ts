// Storybook config of the fixture. Clear A11Y never loads it: stories are read from the built
// storybook-static/index.json. Executing this file is a bug, so it throws.
throw new Error("clear-a11y must never execute a scanned repo's Storybook config");

export default {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  framework: { name: '@storybook/react-vite', options: {} },
};
