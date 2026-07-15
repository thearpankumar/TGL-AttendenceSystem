import { useState, useEffect } from 'react';

const KEY = 'sidebar-collapsed';

const getInitial = (): boolean =>
  localStorage.getItem(KEY) === 'true';

export const useSidebar = () => {
  const [collapsed, setCollapsed] = useState<boolean>(getInitial);

  useEffect(() => {
    localStorage.setItem(KEY, String(collapsed));
  }, [collapsed]);

  const toggle = () => setCollapsed((c) => !c);

  return { collapsed, toggle };
};
