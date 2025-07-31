import {render, screen, waitFor} from '@testing-library/react';
import AuthenticationWrapper from '../../src/authorizer/AuthenticationWrapper';
import {useAuthenticator} from '@aws-amplify/ui-react';
import authService from '../../src/service/AuthService.js';
import { describe, vi, expect, beforeEach, afterEach, test } from 'vitest';

vi.mock('@aws-amplify/ui-react', () => ({
    useAuthenticator: vi.fn(),
    Authenticator: vi.fn(() => <div>Mocked Authenticator Component</div>)
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default : {
        isBlocked: vi.fn(),
        remainingBlockTime: vi.fn(),
        authFailure: vi.fn().mockResolvedValue(),
    }
}));

describe('AuthenticationWrapper', () => {
    let mockUseAuthenticator;

    beforeEach(() => {
        mockUseAuthenticator = useAuthenticator;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should render children if authenticated', () => {
        mockUseAuthenticator.mockReturnValue({ authStatus: 'authenticated', error: null });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        expect(screen.getByText('Mocked Authenticator Component')).toBeDefined();
    });

    test('should show account locked message if blocked', async () => {
        mockUseAuthenticator.mockReturnValue({ authStatus: 'unauthenticated', error: "error" });
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

    test('should call authFailure when error occurs', async () => {
        mockUseAuthenticator.mockReturnValue({ authStatus: 'unauthenticated', error: 'some-error' });

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        await waitFor(() => {
            expect(authService.authFailure).toHaveBeenCalledTimes(1);
        });
    });

    test('should render Authenticator when unauthenticated', () => {
        mockUseAuthenticator.mockReturnValue({ authStatus: 'unauthenticated', error: null });
        authService.isBlocked.mockReturnValue(false);

        render(
            <AuthenticationWrapper>
                <div>Authenticated Content</div>
            </AuthenticationWrapper>
        );

        // Expect that Authenticator component is rendered
        expect(screen.getByText('Mocked Authenticator Component')).toBeDefined();
    });
});
