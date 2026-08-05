import apiClient from '../client/ApiClient.js';
import config from '../properties/ApplicationProperties';

const attachmentService = {
    /**
     * Stages one image. `description` can only be supplied here — the backend has no
     * endpoint to set it afterwards, which is why a caption typed after upload forces
     * a re-stage on send.
     */
    stageAttachment: async (file, description) => {
        const formData = new FormData();
        formData.append('file', file);

        if (description && description.trim()) {
            formData.append('description', description.trim());
        }

        return await apiClient.post(config.attachmentsUri, formData);
    },

    fetchAttachmentBlob: async (attachmentId) => {
        return await apiClient.getBlob(`${config.attachmentsUri}/${attachmentId}`);
    },

    deleteAttachment: async (attachmentId) => {
        return await apiClient.delete(`${config.attachmentsUri}/${attachmentId}`);
    },

    attachmentExists: async (attachmentId) => {
        const responseBlob = await apiClient.getBlob(`${config.attachmentsUri}/${attachmentId}`, {noOp: true});

        return responseBlob !== null;
    },
};

export default attachmentService;
