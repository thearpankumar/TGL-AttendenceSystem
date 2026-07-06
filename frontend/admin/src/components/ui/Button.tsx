import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'delete';
  size?: 'sm' | 'md';
  children: ReactNode;
}

const Button = ({ variant = 'secondary', size, className = '', children, ...props }: ButtonProps) => {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-small' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button className={cls} {...props}>{children}</button>;
};

export default Button;
