import {SYSTEM} from "../chat/ChatMessage.jsx";
import authService from '../service/AuthService.js';

class FetchClientError extends Error {
    constructor({errorMessage, requestMethod, requestUri, stack}) {
        super(errorMessage);
        this.requestMethod = requestMethod;
        this.requestUri = requestUri;

        if (stack) {
            this.stack = stack;
        }
    }
}

async function buildRequestInit(method, data) {
    const token = await authService.getAccessToken();
    const headers = {};

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const init = {method, headers};

    if (data !== null && data !== undefined) {
        if (data instanceof FormData) {
            init.body = data;
        } else {
            init.body = JSON.stringify(data);
            headers['Content-Type'] = 'application/json';
        }
    }

    return init;
}

async function parseSuccessResponse(response) {
    if (response.status === 204) {
        return undefined;
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    return text || undefined;
}

async function executeRequest(method, uri, data, noOp) {
    const init = await buildRequestInit(method, data);

    let response;

    try {
        response = await fetch(uri, init);
    } catch (networkError) {
        if (noOp) {
            return undefined;
        }

        throw new FetchClientError({
            errorMessage: 'Network error or DNS issue',
            requestMethod: method,
            requestUri: uri,
            stack: networkError.stack,
        });
    }

    if (response.status === 401) {
        const freshToken = await authService.getAccessToken();

        if (freshToken) {
            init.headers['Authorization'] = `Bearer ${freshToken}`;

            try {
                response = await fetch(uri, init);
            } catch (retryNetworkError) {
                if (noOp) {
                    return undefined;
                }

                throw new FetchClientError({
                    errorMessage: 'Network error on token retry',
                    requestMethod: method,
                    requestUri: uri,
                    stack: retryNetworkError.stack,
                });
            }
        }
    }

    if (!response.ok) {
        if (noOp) {
            return undefined;
        }

        let errorData = {};

        try {
            errorData = await response.json();
        } catch {
            // Non-JSON error body
        }

        return {
            messageType: SYSTEM,
            message: `${response.status}: ${method} - ${uri} ${errorData.message || response.statusText}`,
        };
    }

    return parseSuccessResponse(response);
}

export default {
    get: (uri, options = {}) => executeRequest('GET', uri, null, options.noOp),
    post: (uri, data = null, options = {}) => executeRequest('POST', uri, data, options.noOp),
    put: (uri, data = null, options = {}) => executeRequest('PUT', uri, data, options.noOp),
    delete: (uri, options = {}) => executeRequest('DELETE', uri, null, options.noOp),
    patch: (uri, data = null, options = {}) => executeRequest('PATCH', uri, data, options.noOp),

    buildUrl: (baseUri, queryParams) => {
        if (!queryParams) {
            return baseUri;
        }

        const url = new URL(baseUri, window.location.origin);

        Object.entries(queryParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        return url.toString().replace(window.location.origin, '');
    },
};
