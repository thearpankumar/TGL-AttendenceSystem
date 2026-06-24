import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef(null);

  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const res = await axios.get('/api/admin/dashboard', {
        signal: abortControllerRef.current.signal,
      });
      setStats(res.data);
    } catch (error) {
      if (error.name !== 'CanceledError') {
        toast.error('Failed to fetch stats');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom: '20px' }}>Dashboard</h2>
      <div className="grid">
        <div className="stat-card">
          <h3>Total Locations</h3>
          <p>{stats?.totalLocations || 0}</p>
          <Link to="/locations" className="btn btn-secondary btn-small">
            Manage
          </Link>
        </div>
        <div className="stat-card">
          <h3>Active Sessions</h3>
          <p>{stats?.activeSessions || 0}</p>
          <Link to="/sessions" className="btn btn-secondary btn-small">
            View
          </Link>
        </div>
        <div className="stat-card">
          <h3>Total Attendance</h3>
          <p>{stats?.totalAttendance || 0}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h3 style={{ marginBottom: '15px' }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/locations" className="btn btn-primary">
            Add Location
          </Link>
          <Link to="/sessions" className="btn btn-success">
            Create Session
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
