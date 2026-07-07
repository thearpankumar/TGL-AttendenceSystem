import { useState } from 'react';

const getInitial = (): 'light' | 'dark' =>
  (localStorage.getItem('theme') as 'light' | 'dark') || 'light';

const apply = (theme: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

apply(getInitial());

export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitial);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      apply(next);
      return next;
    });
  };

  return { theme, toggleTheme };
};
