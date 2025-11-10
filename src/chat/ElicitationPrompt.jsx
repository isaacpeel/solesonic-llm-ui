import "./ElicitationPrompt.css";

function ElicitationPrompt({ elicitation, values, onChange, onSubmit, submitting }) {
    if (!elicitation) {
        return null;
    }

    const schema = elicitation.requestedSchema || {};
    const properties = schema.properties || {};
    const requiredList = Array.isArray(schema.required) ? schema.required : [];
    const requiredSet = new Set(requiredList);

    const nonMetaPropertyEntries = Object.entries(properties).filter(([fieldName]) => fieldName !== 'chatId');
    const isBooleanOnlyPrompt = nonMetaPropertyEntries.length === 1 && (nonMetaPropertyEntries[0][1]?.type === 'boolean');

    const handleInputChange = (fieldName) => (event) => {
        onChange(fieldName, event.target.value);
    };

    const fieldControl = (propertyName, propertyDef) => {
        const currentValue = values[propertyName] ?? '';
        const isReadOnlyField = propertyName === 'chatId';

        if (propertyDef?.type === 'boolean') {
            return (
                <div className="elicitation-boolean-container">
                    <button
                        type="button"
                        className="elicitation-button-secondary"
                        onClick={() => {
                            onChange(propertyName, 'cancel');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'cancel' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="elicitation-button-secondary"
                        onClick={() => {
                            onChange(propertyName, 'decline');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'decline' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        className="elicitation-button-primary"
                        onClick={() => {
                            onChange(propertyName, 'accept');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'accept' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Accept
                    </button>


                    {submitting && isBooleanOnlyPrompt && (
                        <div className="inline-flex items-center text-xs text-slate-400">
                            <svg className="mr-2 h-4 w-4 animate-spin text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            Waiting for assistant...
                        </div>
                    )}
                </div>
            );
        }

        const placeholder = propertyDef?.description || (propertyDef?.format ? `Format: ${propertyDef.format}` : '');

        return (
            <input
                type="text"
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder={placeholder}
                value={currentValue}
                onChange={handleInputChange(propertyName)}
                disabled={submitting || isReadOnlyField}
            />
        );
    };

    return (
        <div className="elicitation-container">
            <div className="elicitation-container-title">{elicitation.message}</div>
            <div className="space-y-3">
                {Object.entries(properties)
                    .filter(([propertyName]) => propertyName !== 'chatId')
                    .map(([propertyName, propertyDef]) => (
                        <div key={propertyName} className="">
                            {fieldControl(propertyName, propertyDef)}
                        </div>
                    ))}
            </div>
            {!isBooleanOnlyPrompt && (
                <div className="mt-3 flex items-center gap-3">
                    {submitting && (
                        <div className="inline-flex items-center text-xs text-slate-400">
                            <svg className="mr-2 h-4 w-4 animate-spin text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            Waiting for assistant...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ElicitationPrompt;
