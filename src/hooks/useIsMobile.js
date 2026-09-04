import {useEffect, useState} from 'react';

const MOBILE_QUERY = '(pointer: coarse) and (max-width: 768px)';

/*
 * pointer:coarse alone also matches touchscreen laptops/hybrids that still have a real
 * keyboard, so it is paired with the same 768px breakpoint the composer already uses for
 * its narrow layout (ChatInput.css) to keep "mobile" meaning phone-sized touch devices.
 */
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

    useEffect(() => {
        const mediaQueryList = window.matchMedia(MOBILE_QUERY);
        const handleChange = () => setIsMobile(mediaQueryList.matches);

        handleChange();

        mediaQueryList.addEventListener('change', handleChange);

        return () => {
            mediaQueryList.removeEventListener('change', handleChange);
        };
    }, []);

    return isMobile;
}

export default useIsMobile;
