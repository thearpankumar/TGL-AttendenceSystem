import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radiusMeters: 100,
    description: '',
  });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/locations');
      setLocations(res.data);
    } catch (error) {
      toast.error('Failed to fetch locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const lat = parseFloat(formData.latitude);
      const lng = parseFloat(formData.longitude);
      const radius = parseInt(formData.radiusMeters);

      if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
        toast.error('Invalid numeric values provided');
        return;
      }

      if (lat < -90 || lat > 90) {
        toast.error('Latitude must be between -90 and 90');
        return;
      }

      if (lng < -180 || lng > 180) {
        toast.error('Longitude must be between -180 and 180');
        return;
      }

      const data = {
        ...formData,
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
      };

      if (editingLocation) {
        await axios.put(`/api/admin/locations/${editingLocation._id}`, data);
        toast.success('Location updated');
      } else {
        await axios.post('/api/admin/locations', data);
        toast.success('Location created');
      }

      setShowModal(false);
      setEditingLocation(null);
      setFormData({
        name: '',
        latitude: '',
        longitude: '',
        radiusMeters: 100,
        description: '',
      });
      fetchLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save location');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this location?')) return;
    try {
      await axios.delete(`/api/admin/locations/${id}`);
      toast.success('Location deleted');
      fetchLocations();
    } catch (error) {
      toast.error('Failed to delete location');
    }
  };

  const openEditModal = (location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      radiusMeters: location.radiusMeters,
      description: location.description || '',
    });
    setShowModal(true);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <div className="row">
        <h2>Locations</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingLocation(null);
            setFormData({
              name: '',
              latitude: '',
              longitude: '',
              radiusMeters: 100,
              description: '',
            });
            setShowModal(true);
          }}
        >
          Add Location
        </button>
      </div>

      {locations.length === 0 ? (
        <div className="card">
          <p>No locations found. Create your first location!</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Coordinates</th>
                <th>Radius (m)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc._id}>
                  <td>{loc.name}</td>
                  <td>
                    {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                  </td>
                  <td>{loc.radiusMeters}</td>
                  <td>
                    <span
                      className={`badge ${
                        loc.isActive ? 'badge-success' : 'badge-danger'
                      }`}
                    >
                      {loc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => openEditModal(loc)}
                    >
                      Edit
                    </button>{' '}
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => handleDelete(loc._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingLocation ? 'Edit Location' : 'Add Location'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                    &times;
                  </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Location Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) =>
                    setFormData({ ...formData, latitude: e.target.value })
                  }
                  required
                  placeholder="e.g., 12.9715987"
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) =>
                    setFormData({ ...formData, longitude: e.target.value })
                  }
                  required
                  placeholder="e.g., 77.5945627"
                />
              </div>
              <div className="form-group">
                <label>Radius (meters)</label>
                <input
                  type="number"
                  value={formData.radiusMeters}
                  onChange={(e) =>
                    setFormData({ ...formData, radiusMeters: e.target.value })
                  }
                  min="10"
                  max="10000"
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
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary">
                  {editingLocation ? 'Update' : 'Create'}
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

export default Locations;
