import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { title: 'Components/Card', component: Card };
export default meta;

const args = { title: 'Trail running shoe', price: '89 euros', note: 'Free shipping over 50 euros' };

export const Default: StoryObj<typeof Card> = { args };

// Seeded barrier: the shipping note is light grey on white (1.4.3).
export const LowContrast: StoryObj<typeof Card> = { args: { ...args, tone: 'muted' } };
