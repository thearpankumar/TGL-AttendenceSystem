import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle, XCircle } from 'lucide-react';

interface ActivityItem {
  studentName: string;
  locationName: string;
  rollNumber: string;
  capturedAt: string;
  verified: boolean;
}

const ActivityFeed = () => {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get<ActivityItem[]>('/api/admin/dashboard/recent-activity');
        setItems(res.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="activity-feed-empty">Loading activity...</p>;
  if (!items.length) return <p className="activity-feed-empty">No recent activity.</p>;

  return (
    <ul className="activity-feed">
      {items.map((item, i) => (
        <li key={i} className="activity-item">
          <span className="activity-icon" style={{ color: item.verified ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {item.verified ? <CheckCircle size={14} /> : <XCircle size={14} />}
          </span>
          <div className="activity-body">
            <span className="activity-name">{item.studentName}</span>
            <span className="activity-sub">{item.locationName} · {item.rollNumber}</span>
          </div>
          <span className="activity-time">
            {new Date(item.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default ActivityFeed;
