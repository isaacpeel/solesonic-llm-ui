import axios from 'axios';
import {SYSTEM} from "../chat/ChatMessage.jsx";
import authService from '../service/AuthService.js';

class AxiosClientError extends Error {
    constructor({ errorMessage, requestMethod, requestUri, stack }) {
        super(errorMessage);
        this.requestMethod = requestMethod;
        this.requestUri = requestUri;
        if (stack) {
            this.stack = stack;
        }
    }
}

const axiosInstance = axios.create({
    headers: {
        'Content-Type': 'application/json',
    }
});

axiosInstance.interceptors.request.use(
    async (config) => {
        try {
            const token = await authService.getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error('Failed to get access token:', error);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

axiosInstance.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const token = await authService.getAccessToken();
                
                if (token) {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return axiosInstance(originalRequest);
                }
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default {
    get: async (uri, options = {}) => {
        try {
            const response = await axiosInstance.get(uri, options);
            return response.data;
        } catch (error) {
            return handleError(error, 'GET', uri, options.noOp);
        }
    },
    
    post: async (uri, data = null, options = {}) => {
        try {
            const response = await axiosInstance.post(uri, data, options);
            return response.data;
        } catch (error) {
            return handleError(error, 'POST', uri, options.noOp);
        }
    },
    
    put: async (uri, data = null, options = {}) => {
        try {
            const response = await axiosInstance.put(uri, data, options);
            return response.data;
        } catch (error) {
            return handleError(error, 'PUT', uri, options.noOp);
        }
    },
    
    delete: async (uri, options = {}) => {
        try {
            const response = await axiosInstance.delete(uri, options);
            return response.data;
        } catch (error) {
            return handleError(error, 'DELETE', uri, options.noOp);
        }
    },
    
    patch: async (uri, data = null, options = {}) => {
        try {
            const response = await axiosInstance.patch(uri, data, options);
            return response.data;
        } catch (error) {
            return handleError(error, 'PATCH', uri, options.noOp);
        }
    },
    
    setAuthHeader: (token) => {
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    },
    
    buildUrl: (baseUri, queryParams) => {
        if (!queryParams) return baseUri;
        
        const url = new URL(baseUri, window.location.origin);
        Object.entries(queryParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });
        
        return url.toString().replace(window.location.origin, '');
    }
};

function handleError(error, method, uri, noOp) {
    if (noOp) return;
    
    if (error.response) {
        const errorData = error.response.data || {};
        
        return {
            messageType: SYSTEM,
            message: `${error.response.status}: ${method} - ${uri} ${errorData.message || error.response.statusText}`,
        };
    } else if (error.request) {
        throw new AxiosClientError({
            errorMessage: 'Network error or DNS issue',
            requestMethod: method,
            requestUri: uri,
            stack: error.stack
        });
    } else {
        throw new AxiosClientError({
            errorMessage: 'Request failed',
            requestMethod: method,
            requestUri: uri,
            stack: error.stack
        });
    }
}