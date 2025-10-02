import {render, screen, waitFor} from '@testing-library/react';
import AuthenticationWrapper from '../../src/authorizer/AuthenticationWrapper';
import {useKeycloak} from '../../src/providers/KeycloakProvider';
import authService from '../../src/service/AuthService.js';
import { describe, vi, expect, beforeEach, afterEach, test } from 'vitest';

vi.mock('../../src/providers/KeycloakProvider', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default : {
        isBlocked: vi.fn(),
        remainingBlockTime: vi.fn(),
        authFailure: vi.fn().mockResolvedValue(),
        setKeycloakInstance: vi.fn(),
    }
}));

describe('AuthenticationWrapper', () => {
    beforeEach(() => {
        authService.isBlocked.mockReturnValue(false);
        authService.remainingBlockTime.mockReturnValue(0);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should render children if authenticated', () => {
        useKeycloak.mockReturnValue({ 
            keycloak: {}, 
            authenticated: true, 
            loading: false,
            login: vi.fn()
        });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        expect(screen.getByText('Authenticated Content')).toBeDefined();
    });

    test('should show loading state while Keycloak initializes', () => {
        useKeycloak.mockReturnValue({ 
            keycloak: null, 
            authenticated: false, 
            loading: true,
            login: vi.fn()
        });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        expect(screen.getByText('Loading...')).toBeDefined();
        expect(screen.getByText('Initializing authentication...')).toBeDefined();
    });

    test('should show account locked message if blocked', async () => {
        useKeycloak.mockReturnValue({ 
            keycloak: {}, 
            authenticated: false, 
            loading: false,
            login: vi.fn()
        });
        authService.isBlocked.mockReturnValue(true);
        authService.remainingBlockTime.mockReturnValue(5000);

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Account Locked')).toBeDefined();
            expect(screen.getByText('Locked out for 5 seconds.')).toBeDefined();
        });
    });

    test('should call authFailure when keycloak has error', async () => {
        const mockKeycloak = { error: 'some-error' };
        useKeycloak.mockReturnValue({ 
            keycloak: mockKeycloak, 
            authenticated: false, 
            loading: false,
            login: vi.fn()
        });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        await waitFor(() => {
            expect(authService.authFailure).toHaveBeenCalledWith('some-error');
        });
    });

    test('should show login prompt when unauthenticated', () => {
        const mockLogin = vi.fn();
        useKeycloak.mockReturnValue({ 
            keycloak: {}, 
            authenticated: false, 
            loading: false,
            login: mockLogin
        });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        expect(screen.getByText('Authentication Required')).toBeDefined();
        expect(screen.getByText('Please log in to continue.')).toBeDefined();
        expect(screen.getByText('Log In')).toBeDefined();
    });
});
