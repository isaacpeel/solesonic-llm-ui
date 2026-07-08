import { ROLES } from '../authorizer/roles.js';
import {
    Cog6ToothIcon,
    ServerIcon,
    UserCircleIcon,
    CubeTransparentIcon,
} from '@heroicons/react/24/solid';
import { SiAtlassian } from 'react-icons/si';

export const SETTINGS_CONFIG = [
    {
        key: 'modelSettings',
        label: 'Chat Model',
        icon: Cog6ToothIcon,
        requiredRole: ROLES.MODEL_SELECT,
    },
    {
        key: 'ollamaModelSettings',
        label: 'Ollama Models',
        icon: ServerIcon,
        requiredRole: ROLES.MODEL_ADMIN,
    },
    {
        key: 'generalUserSettings',
        label: 'General',
        icon: UserCircleIcon,
    },
    {
        key: 'atlassianSettings',
        label: 'Atlassian',
        icon: SiAtlassian,
    },
    {
        key: 'ragManagement',
        label: 'RAG',
        icon: CubeTransparentIcon,
        requiredRole: ROLES.RAG_ADMIN,
    },
];
