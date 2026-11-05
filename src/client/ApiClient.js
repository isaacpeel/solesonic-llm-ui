import authService from '../service/AuthService.js';

export class ApiError extends Error {
    constructor({ message, status, method, uri, code, serverMessage, usernames }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.method = method;
        this.uri = uri;
        this.code = code;
        this.serverMessage = serverMessage;
        this.usernames = usernames;
    }
}

export async function readApiErrorBody(response) {
    try {
        const errorBody = await response.json();

        const usernames = Array.isArray(errorBody?.usernames) ? errorBody.usernames : undefined;

        return {message: errorBody?.message, code: errorBody?.code, usernames};
    } catch {
        return {message: undefined, code: undefined, usernames: undefined};
    }
}

async function request(method, uri, { body, headers = {}, noOp = false, responseType = 'json', signal } = {}) {
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
        signal,
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

        const errorBody = await readApiErrorBody(response);

        throw new ApiError({
            message: `${response.status}: ${method} - ${uri} ${errorBody.message || response.statusText}`,
            status: response.status,
            method,
            uri,
            code: errorBody.code,
            serverMessage: errorBody.message,
            usernames: errorBody.usernames,
        });
    }

    if (response.status === 204) {
        return null;
    }

    if (responseType === 'blob') {
        return await response.blob();
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
    getBlob: (uri, options) => request('GET', uri, { ...options, responseType: 'blob' }),
    post: (uri, body, options) => request('POST', uri, { ...options, body }),
    put: (uri, body, options) => request('PUT', uri, { ...options, body }),
    delete: (uri, options) => request('DELETE', uri, options),
    patch: (uri, body, options) => request('PATCH', uri, { ...options, body }),
};

export default apiClient;
