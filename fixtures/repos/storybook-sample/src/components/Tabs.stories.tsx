import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from './Tabs';
import { TabsOk } from './TabsOk';

const tabs = [
  { id: '1', label: 'Description', content: 'Lightweight shoe with a grippy sole.' },
  { id: '2', label: 'Sizing', content: 'Runs half a size small.' },
  { id: '3', label: 'Reviews', content: '4.6 out of 5 from 120 reviews.' },
];

const meta: Meta<typeof TabsOk> = { title: 'Components/Tabs', component: TabsOk };
export default meta;

export const Default: StoryObj<typeof TabsOk> = { args: { tabs, label: 'Product details' } };

// Seeded barrier: no arrow keys, so the inactive tabs can't be reached by keyboard (2.1.1).
export const NoArrowKeys: StoryObj<typeof Tabs> = {
  render: () => <Tabs tabs={tabs} label="Product details" />,
};
