import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    locationId: '',
    durationMinutes: 30,
    description: '',
  });
  const abortControllerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const [sessionsRes, locationsRes] = await Promise.all([
        axios.get('/api/admin/sessions', { signal: abortControllerRef.current.signal }),
        axios.get('/api/admin/locations', { signal: abortControllerRef.current.signal }),
      ]);
      setSessions(sessionsRes.data);
      setLocations(locationsRes.data);
    } catch (error) {
      if (error.name !== 'CanceledError') {
        toast.error('Failed to fetch data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const duration = parseInt(formData.durationMinutes);
      if (isNaN(duration) || duration < 5 || duration > 480) {
        toast.error('Duration must be between 5 and 480 minutes');
        return;
      }

      const res = await axios.post('/api/admin/sessions', {
        ...formData,
        durationMinutes: duration,
      });

      const token = res.data.token;
      const baseUrl = window.location.origin.replace(/:\d+$/, '');
      const attendanceLink = `${baseUrl}/attend/${token}`;

      toast.success('Session created! Link copied to clipboard.');
      navigator.clipboard.writeText(attendanceLink);

      setShowModal(false);
      setFormData({ locationId: '', durationMinutes: 30, description: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create session');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this session?')) return;
    try {
      await axios.post(`/api/admin/sessions/${id}/deactivate`);
      toast.success('Session deactivated');
      fetchData();
    } catch (error) {
      toast.error('Failed to deactivate session');
    }
  };

  const isExpired = useCallback((session) => {
    return new Date(session.expiresAt) < new Date();
  }, []);

  const getStatus = useCallback((session) => {
    if (!session.isActive) return { label: 'Inactive', class: 'badge-danger' };
    if (isExpired(session)) return { label: 'Expired', class: 'badge-warning' };
    return { label: 'Active', class: 'badge-success' };
  }, [isExpired]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [sessions]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <div className="row">
        <h2>Attendance Sessions</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          disabled={locations.length === 0}
        >
          Create Session
        </button>
      </div>

      {locations.length === 0 && (
        <div className="card">
          <p>
            No locations found. <Link to="/locations">Create a location first</Link>
          </p>
        </div>
      )}

      {sessions.length === 0 && locations.length > 0 ? (
        <div className="card">
          <p>No sessions found. Create your first attendance session!</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Status</th>
                <th>Expires At</th>
                <th>Students</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((session) => {
                const status = getStatus(session);
                return (
                  <tr key={session._id}>
                    <td>{session.locationId?.name || 'Unknown'}</td>
                    <td>
                      <span className={`badge ${status.class}`}>{status.label}</span>
                    </td>
                    <td>{new Date(session.expiresAt).toLocaleString()}</td>
                    <td>{session.attendanceCount}</td>
                    <td>
                      <Link
                        to={`/sessions/${session._id}`}
                        className="btn btn-secondary btn-small"
                      >
                        View
                      </Link>
                      {session.isActive && !isExpired(session) && (
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeactivate(session._id)}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Attendance Session</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Location</label>
                <select
                  value={formData.locationId}
                  onChange={(e) =>
                    setFormData({ ...formData, locationId: e.target.value })
                  }
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                >
                  <option value="">Select a location</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name} (Radius: {loc.radiusMeters}m)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, durationMinutes: e.target.value })
                  }
                  min="5"
                  max="480"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows="2"
                  placeholder="e.g., Morning attendance for CS101"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-success">
                  Create Session
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;
