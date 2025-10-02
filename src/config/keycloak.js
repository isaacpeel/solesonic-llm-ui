/**
 * Keycloak Configuration
 * 
 * This module exports the Keycloak configuration based on environment variables.
 * Configuration is loaded from .env
 */

const keycloakConfig = {
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: import.meta.env.VITE_KEYCLOAK_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
};

// Validate that required environment variables are set
if (!keycloakConfig.url || !keycloakConfig.realm || !keycloakConfig.clientId) {
    console.error('Missing required Keycloak environment variables:', {
        url: keycloakConfig.url,
        realm: keycloakConfig.realm,
        clientId: keycloakConfig.clientId,
    });
}

export default keycloakConfig;
