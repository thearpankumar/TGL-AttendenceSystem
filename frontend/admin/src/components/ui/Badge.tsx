import type { ReactNode } from 'react';

interface BadgeProps {
  tone?: 'success' | 'danger' | 'warning' | 'neutral';
  children: ReactNode;
}

const Badge = ({ tone = 'neutral', children }: BadgeProps) => (
  <span className={`badge badge-${tone}`}>
    <span className="badge-dot" />
    {children}
  </span>
);

export default Badge;
