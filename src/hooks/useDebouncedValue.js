import {useEffect, useState} from 'react';

function useDebouncedValue(value, delayMilliseconds) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = setTimeout(() => setDebouncedValue(value), delayMilliseconds);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [value, delayMilliseconds]);

    return debouncedValue;
}

export default useDebouncedValue;
