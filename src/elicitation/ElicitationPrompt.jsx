import "./ElicitationPrompt.css";
import elicitationService from '../service/ElicitationService.js';

const SpinnerLabel = () => (
    <div className="inline-flex items-center text-xs text-slate-400">
        <svg className="mr-2 h-4 w-4 animate-spin text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Waiting for assistant...
    </div>
);

const getEnumOptions = (propertyDef) => {
    if (propertyDef.enum) {
        return propertyDef.enum.map((value) => ({
            value,
            label: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
        }));
    }
    if (propertyDef.oneOf) {
        return propertyDef.oneOf.map((item) => ({ value: item.const, label: item.title }));
    }
    return null;
};

const getMultiEnumOptions = (propertyDef) => {
    const items = propertyDef.items;
    if (!items) return null;
    if (items.enum) {
        return items.enum.map((value) => ({ value, label: value }));
    }
    if (items.anyOf) {
        return items.anyOf.map((item) => ({ value: item.const, label: item.title }));
    }
    return null;
};

const PRIMARY_ACTION_KEYWORDS = new Set(['ACCEPT', 'CONFIRM', 'YES', 'OK', 'APPROVE']);

function ElicitationPrompt({ elicitation, values, onChange, onSubmit, submitting }) {
    if (!elicitation) {
        return null;
    }

    const schema = elicitationService.normalizeElicitationSchema(elicitation.requestedSchema);
    const isDirectSchema = !schema.properties && (schema.type || schema.enum || schema.oneOf);

    const nonMetaPropertyEntries = isDirectSchema
        ? [['value', schema]]
        : Object.entries(schema.properties || {}).filter(([fieldName]) => fieldName !== 'chatId');

    const actionField = nonMetaPropertyEntries.length === 1 ? nonMetaPropertyEntries[0][1] : null;
    const isSingleActionField = Boolean(actionField?.enum || actionField?.oneOf);

    const fieldControl = (propertyName, propertyDef) => {
        const currentValue = values[propertyName] ?? '';
        const isReadOnlyField = propertyName === 'chatId';

        // --- Single-select enum (via `enum` or `oneOf`) ---
        const enumOptions = getEnumOptions(propertyDef);
        if (enumOptions) {
            const primaryValue =
                [...enumOptions].reverse().find((option) => PRIMARY_ACTION_KEYWORDS.has(option.value.toUpperCase()))?.value
                ?? enumOptions[enumOptions.length - 1]?.value;

            if (enumOptions.length > 5) {
                return (
                    <select
                        className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        value={currentValue}
                        onChange={(event) => onChange(propertyName, event.target.value)}
                        disabled={submitting || isReadOnlyField}
                    >
                        <option value="" disabled>Select an option…</option>
                        {enumOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                );
            }

            return (
                <div className="elicitation-boolean-container">
                    {enumOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={option.value === primaryValue ? 'elicitation-button-primary' : 'elicitation-button-secondary'}
                            disabled={submitting || isReadOnlyField}
                            onClick={() => {
                                onChange(propertyName, option.value);
                                if (isSingleActionField) {
                                    onSubmit({ [propertyName]: option.value });
                                    }
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                    {submitting && isSingleActionField && <SpinnerLabel />}
                </div>
            );
        }

        // --- Multi-select enum (array type) ---
        if (propertyDef?.type === 'array') {
            const multiOptions = getMultiEnumOptions(propertyDef);
            if (multiOptions) {
                const selectedValues = Array.isArray(currentValue) ? currentValue : [];
                const maxItems = propertyDef.maxItems ?? Infinity;

                return (
                    <div className="flex flex-col gap-1">
                        {multiOptions.map((option) => {
                            const isChecked = selectedValues.includes(option.value);
                            const isDisabled = submitting || isReadOnlyField || (!isChecked && selectedValues.length >= maxItems);
                            return (
                                <label key={option.value} className="flex items-center gap-2 text-sm text-slate-100 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isDisabled}
                                        onChange={() => {
                                            const updatedValues = isChecked
                                                ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                                                : [...selectedValues, option.value];
                                            onChange(propertyName, updatedValues);
                                        }}
                                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-slate-400"
                                    />
                                    {option.label}
                                </label>
                            );
                        })}
                    </div>
                );
            }
        }

        // --- Number / Integer ---
        if (propertyDef?.type === 'number' || propertyDef?.type === 'integer') {
            return (
                <input
                    type="number"
                    className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    placeholder={propertyDef.description || ''}
                    value={currentValue}
                    min={propertyDef.minimum ?? undefined}
                    max={propertyDef.maximum ?? undefined}
                    step={propertyDef.type === 'integer' ? 1 : 'any'}
                    onChange={(event) => onChange(propertyName, event.target.valueAsNumber)}
                    disabled={submitting || isReadOnlyField}
                />
            );
        }

        // --- Plain string ---
        const formatToInputType = { email: 'email', uri: 'url', date: 'date', 'date-time': 'datetime-local' };
        const inputType = formatToInputType[propertyDef?.format] ?? 'text';
        const placeholder = propertyDef?.description || (propertyDef?.format ? `Format: ${propertyDef.format}` : '');

        return (
            <input
                type={inputType}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder={placeholder}
                value={currentValue}
                minLength={propertyDef?.minLength ?? undefined}
                maxLength={propertyDef?.maxLength ?? undefined}
                onChange={(event) => onChange(propertyName, event.target.value)}
                disabled={submitting || isReadOnlyField}
            />
        );
    };

    return (
        <div className="elicitation-container">
            <div className="elicitation-container-title">{elicitation.message}</div>
            <div className="space-y-3">
                {nonMetaPropertyEntries.map(([propertyName, propertyDef]) => (
                    <div key={propertyName}>
                        {propertyDef.title && (
                            <label className="block text-xs font-medium text-slate-300 mb-1">{propertyDef.title}</label>
                        )}
                        {fieldControl(propertyName, propertyDef)}
                    </div>
                ))}
            </div>
            {!isSingleActionField && (
                <div className="mt-3 flex items-center gap-3">
                    <button
                        type="button"
                        className="elicitation-button-primary"
                        onClick={() => onSubmit()}
                        disabled={submitting}
                    >
                        Submit
                    </button>
                    {submitting && <SpinnerLabel />}
                </div>
            )}
        </div>
    );
}

export default ElicitationPrompt;
