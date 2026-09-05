import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';

const addressService = {
    create: async (address) => {
        return await apiClient.post(config.addressesUri, address);
    },
    get: async (addressId) => {
        return await apiClient.get(`${config.addressesUri}/${addressId}`);
    },
    update: async (addressId, address) => {
        return await apiClient.put(`${config.addressesUri}/${addressId}`, address);
    },
    remove: async (addressId) => {
        return await apiClient.delete(`${config.addressesUri}/${addressId}`);
    },
};

export default addressService;
