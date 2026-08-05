import { render } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import RoleGuard from '../../src/authorizer/RoleGuard.jsx';
import { useKeycloak } from '../../src/providers/KeycloakProvider.jsx';

vi.mock('../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

function mockWithRole(roleName) {
    useKeycloak.mockReturnValue({ hasRole: (role) => role === roleName });
}

function mockWithNoRoles() {
    useKeycloak.mockReturnValue({ hasRole: () => false });
}

describe('RoleGuard', () => {
    describe('when the user holds the required role', () => {
        beforeEach(() => mockWithRole('model-admin'));

        it('renders children', () => {
            const { getByText } = render(
                <RoleGuard role="model-admin">
                    <span>protected content</span>
                </RoleGuard>
            );
            expect(getByText('protected content')).toBeDefined();
        });

        it('does not render the fallback', () => {
            const { queryByText } = render(
                <RoleGuard role="model-admin" fallback={<span>access denied</span>}>
                    <span>protected content</span>
                </RoleGuard>
            );
            expect(queryByText('access denied')).toBeNull();
        });
    });

    describe('when the user does not hold the required role', () => {
        beforeEach(() => mockWithNoRoles());

        it('renders the fallback when provided', () => {
            const { getByText } = render(
                <RoleGuard role="model-admin" fallback={<span>access denied</span>}>
                    <span>protected content</span>
                </RoleGuard>
            );
            expect(getByText('access denied')).toBeDefined();
        });

        it('renders nothing when no fallback is provided', () => {
            const { queryByText } = render(
                <RoleGuard role="model-admin">
                    <span>protected content</span>
                </RoleGuard>
            );
            expect(queryByText('protected content')).toBeNull();
        });

        it('does not render children', () => {
            const { queryByText } = render(
                <RoleGuard role="model-admin" fallback={<span>access denied</span>}>
                    <span>protected content</span>
                </RoleGuard>
            );
            expect(queryByText('protected content')).toBeNull();
        });
    });
});
