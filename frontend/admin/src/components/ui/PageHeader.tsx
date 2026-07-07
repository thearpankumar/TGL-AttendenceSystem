import type { ReactNode } from 'react';

const PageHeader = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="page-header">
    <h2>{title}</h2>
    {children && <div className="page-header-actions">{children}</div>}
  </div>
);

export default PageHeader;
