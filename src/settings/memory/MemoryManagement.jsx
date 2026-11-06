import {Navigate, NavLink, useParams} from "react-router";

import {useKeycloak} from "../../providers/KeycloakProvider.jsx";
import {DEFAULT_MEMORY_LEVEL, findMemoryLevel, visibleMemoryLevels} from "./memoryLevels.js";
import MyMemories from "./MyMemories.jsx";
import AllMemories from "./AllMemories.jsx";
import MemoryReflections from "./MemoryReflections.jsx";
import MemoryStatus from "./MemoryStatus.jsx";
import "./MemoryManagement.css";

const LEVEL_VIEWS = {
    mine: MyMemories,
    all: AllMemories,
    reflections: MemoryReflections,
    status: MemoryStatus,
};

const MemoryManagement = () => {
    const {level} = useParams();
    const {hasGroup} = useKeycloak();

    const memoryLevel = findMemoryLevel(level);
    const availableLevels = visibleMemoryLevels(hasGroup);
    const levelAllowed = Boolean(memoryLevel) && availableLevels.some((candidate) => candidate.level === memoryLevel.level);

    if (!levelAllowed) {
        return <Navigate to={`/settings/memory/${DEFAULT_MEMORY_LEVEL}`} replace/>;
    }

    const LevelView = LEVEL_VIEWS[memoryLevel.level];

    return (
        <div className="memory-management">
            <h2>Memory</h2>
            <p className="settings-content-subtitle">
                What the assistant has learned from your conversations, and the means to correct it.
            </p>

            {availableLevels.length > 1 && (
                <nav className="memory-tab-bar" aria-label="Memory sections">
                    {availableLevels.map((candidate) => (
                        <NavLink
                            key={candidate.level}
                            to={`/settings/memory/${candidate.level}`}
                            className={({isActive}) => `memory-tab ${isActive ? "active" : ""}`}
                        >
                            {candidate.label}
                            {candidate.requiresGroup && <span className="settings-admin-badge">Admin</span>}
                        </NavLink>
                    ))}
                </nav>
            )}

            <p className="memory-level-description">{memoryLevel.description}</p>

            <LevelView key={memoryLevel.level}/>
        </div>
    );
};

export default MemoryManagement;
