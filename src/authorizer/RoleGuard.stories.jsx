import { expect } from 'storybook/test';
import RoleGuard from './RoleGuard.jsx';

/*
 * The shared preview stubs useKeycloak() with roles ['user', 'admin'] (see
 * .storybook/preview.jsx) — 'admin' passes hasRole, anything else does not.
 */
const meta = {
    component: RoleGuard,
    tags: ['ai-generated'],
};

export default meta;

export const RoleGranted = {
    args: {
        role: 'admin',
        children: <div>Admin panel</div>,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Admin panel')).toBeVisible();
    },
};

export const RoleDeniedWithFallback = {
    args: {
        role: 'superadmin',
        fallback: <div>You do not have access to this section.</div>,
        children: <div>Admin panel</div>,
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('You do not have access to this section.')).toBeVisible();
        await expect(canvas.queryByText('Admin panel')).not.toBeInTheDocument();
    },
};

export const RoleDeniedNoFallback = {
    args: {
        role: 'superadmin',
        children: <div>Admin panel</div>,
    },
};
