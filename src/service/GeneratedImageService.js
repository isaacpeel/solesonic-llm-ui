import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';

const DEFAULT_PAGE_SIZE = 20;

const ADMIN_IMAGES_URI = `${config.imagesUri}/admin`;

// Ownership comes from the bearer token for the self-service endpoints, so there is no userId
// in any of these paths — mirrors chatService.renameChat/deleteChat.
const generatedImageService = {
    findMyImages: async (page = 0, size = DEFAULT_PAGE_SIZE) => {
        const queryString = new URLSearchParams({page: String(page), size: String(size)}).toString();
        return await apiClient.get(`${config.imagesUri}?${queryString}`);
    },

    renameImage: async (imageId, name) => {
        return await apiClient.patch(`${config.imagesUri}/${imageId}`, {name});
    },

    deleteImage: async (imageId) => {
        return await apiClient.delete(`${config.imagesUri}/${imageId}`);
    },

    // Admin listing spans every user's images. Omitting userId returns the global feed;
    // supplying it drills into one user's images via the same endpoint.
    findAllImages: async ({userId} = {}, page = 0, size = DEFAULT_PAGE_SIZE) => {
        const queryParams = {page: String(page), size: String(size)};

        if (userId) {
            queryParams.userId = userId;
        }

        const queryString = new URLSearchParams(queryParams).toString();
        return await apiClient.get(`${ADMIN_IMAGES_URI}?${queryString}`);
    },

    renameImageAdmin: async (imageId, name) => {
        return await apiClient.patch(`${ADMIN_IMAGES_URI}/${imageId}`, {name});
    },

    deleteImageAdmin: async (imageId) => {
        return await apiClient.delete(`${ADMIN_IMAGES_URI}/${imageId}`);
    },
};

export default generatedImageService;
