import { useState, useEffect } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true); // default to true to prevent flash

  useEffect(() => {
    const checkMobile = () => {
      // Hardware-level touch check (the most reliable indicator of a phone/tablet)
      const hasTouchScreen = navigator.maxTouchPoints > 0;
      
      // CSS media query check for coarse pointer (finger) vs fine pointer (mouse)
      const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

      // Ensure that we only allow touch devices
      setIsMobile(hasTouchScreen || hasCoarsePointer);
    };

    checkMobile();
    
    // Listen for changes (e.g. if DevTools mobile emulation is toggled)
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}
