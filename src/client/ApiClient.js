import authService from '../service/AuthService.js';

export class ApiError extends Error {
    constructor({ message, status, method, uri }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.method = method;
        this.uri = uri;
    }
}

async function request(method, uri, { body, headers = {}, noOp = false } = {}) {
    const token = await authService.getAccessToken();

    const requestHeaders = { ...headers };

    if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
    }

    if (body && !(body instanceof FormData)) {
        requestHeaders['Content-Type'] = 'application/json';
    }

    const init = {
        method,
        headers: requestHeaders,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    };

    let response = await fetch(uri, init);

    if (response.status === 401) {
        const refreshedToken = await authService.getAccessToken();
        if (refreshedToken) {
            init.headers = { ...init.headers, Authorization: `Bearer ${refreshedToken}` };
            response = await fetch(uri, init);
        }
    }

    if (!response.ok) {
        if (noOp) {
            return null;
        }

        let errorMessage = response.statusText;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || response.statusText;
        } catch {
            // keep statusText fallback
        }

        throw new ApiError({
            message: `${response.status}: ${method} - ${uri} ${errorMessage}`,
            status: response.status,
            method,
            uri,
        });
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return null;
    }

    return await response.json();
}

export function buildUrl(baseUri, queryParams) {
    if (!queryParams) {
        return baseUri;
    }

    const url = new URL(baseUri, window.location.origin);

    for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.append(key, value);
    }

    return url.toString().replace(window.location.origin, '');
}

const apiClient = {
    get: (uri, options) => request('GET', uri, options),
    post: (uri, body, options) => request('POST', uri, { ...options, body }),
    put: (uri, body, options) => request('PUT', uri, { ...options, body }),
    delete: (uri, options) => request('DELETE', uri, options),
    patch: (uri, body, options) => request('PATCH', uri, { ...options, body }),
};

export default apiClient;
