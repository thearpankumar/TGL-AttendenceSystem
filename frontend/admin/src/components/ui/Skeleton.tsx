export const SkeletonTiles = ({ count = 3 }: { count?: number }) => (
  <div className="grid">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skeleton skeleton-tile" />
    ))}
  </div>
);

export const SkeletonRows = ({ count = 5 }: { count?: number }) => (
  <div className="card">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skeleton skeleton-row" />
    ))}
  </div>
);
