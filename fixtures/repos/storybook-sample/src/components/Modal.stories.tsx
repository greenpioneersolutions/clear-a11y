import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from './Modal';
import { ModalOk } from './ModalOk';

const meta: Meta<typeof ModalOk> = { title: 'Components/Modal', component: ModalOk };
export default meta;

export const Default: StoryObj<typeof ModalOk> = {};

// Seeded barrier: no focus management when the dialog opens or closes (2.4.3).
export const NoFocusManagement: StoryObj<typeof Modal> = { render: () => <Modal /> };
