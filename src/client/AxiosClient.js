import axios from 'axios';
import {SYSTEM} from "../chat/ChatMessage.jsx";

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

// Create axios instance with default configuration
const axiosInstance = axios.create({
    headers: {
        'Content-Type': 'application/json',
    }
});

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
    
    // Helper function to set auth token
    setAuthHeader: (token) => {
        return {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };
    },
    
    // Helper function to build URL with query parameters
    buildUrl: (baseUri, queryParams) => {
        if (!queryParams) return baseUri;
        
        const url = new URL(baseUri, window.location.origin);
        Object.entries(queryParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });
        
        return url.toString().replace(window.location.origin, '');
    }
};

// Helper function to handle errors consistently
function handleError(error, method, uri, noOp) {
    if (noOp) return;
    
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const errorData = error.response.data || {};
        
        return {
            messageType: SYSTEM,
            message: `${error.response.status}: ${method} - ${uri} ${errorData.message || error.response.statusText}`,
        };
    } else if (error.request) {
        // The request was made but no response was received
        throw new AxiosClientError({
            errorMessage: 'Network error or DNS issue',
            requestMethod: method,
            requestUri: uri,
            stack: error.stack
        });
    } else {
        // Something happened in setting up the request that triggered an Error
        throw new AxiosClientError({
            errorMessage: 'Request failed',
            requestMethod: method,
            requestUri: uri,
            stack: error.stack
        });
    }
}