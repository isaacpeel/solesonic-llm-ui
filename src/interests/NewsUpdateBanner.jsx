import {Link} from "react-router";
import {NewspaperIcon} from "@heroicons/react/20/solid";

import describeSources from "./describeSources.js";
import "./NewsUpdateBanner.css";

const NewsUpdateBanner = ({update}) => {
    if (!update) {
        return null;
    }

    const agentExists = Boolean(update.agentId);
    const showSources = agentExists && Number.isInteger(update.itemCount);

    return (
        <div className="news-update-banner" role="note">
            <NewspaperIcon className="news-update-banner-icon" aria-hidden="true"/>
            <span className="news-update-banner-text">
                News update · {update.label}
                {showSources && ` · ${describeSources(update.itemCount)}`}
                {agentExists && (
                    <> · <Link className="news-update-banner-manage" to="/settings/interests">Manage</Link></>
                )}
            </span>
        </div>
    );
};

export default NewsUpdateBanner;
