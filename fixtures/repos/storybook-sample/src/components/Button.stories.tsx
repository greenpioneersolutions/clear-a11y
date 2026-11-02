import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { IconButton } from './IconButton';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
};
export default meta;

export const Primary: StoryObj<typeof Button> = {
  args: { children: 'Save changes' },
};

// Seeded barrier: the close button shows an icon and has no accessible name (4.1.2).
export const IconOnly: StoryObj<typeof IconButton> = {
  render: () => <IconButton id="close-button" />,
};
