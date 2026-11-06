/*
 * Display settings the API copies from each model's LiteLLM model_info: displayName (always set, the id
 * when no display_name is configured) and hidden (ui_hidden). A list from an API without them, or a model
 * missing from the list, falls back to the id and is shown.
 */

function findModel(models, modelId) {
    const normalizedId = modelId.toLowerCase();

    return (models ?? []).find((model) => model?.id?.toLowerCase() === normalizedId);
}

export function modelLabel(models, modelId) {
    if (!modelId) {
        return modelId;
    }

    return findModel(models, modelId)?.displayName || modelId;
}

/**
 * Hidden models stay selectable by name and keep their label; only a picker's list leaves them out.
 */
export function visibleModels(models) {
    return (models ?? []).filter((model) => !model?.hidden);
}
