const Location = require('../models/Location');

const createLocation = async (req, res) => {
  try {
    const { name, latitude, longitude, radiusMeters, description } = req.body;

    const location = await Location.create({
      name,
      latitude,
      longitude,
      radiusMeters: radiusMeters || 100,
      description,
      createdBy: req.admin._id,
    });

    res.status(201).json(location);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getLocations = async (req, res) => {
  try {
    const locations = await Location.find({ createdBy: req.admin._id })
      .sort({ createdAt: -1 });

    res.json(locations);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getLocationById = async (req, res) => {
  try {
    const location = await Location.findOne({
      _id: req.params.id,
      createdBy: req.admin._id,
    });

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json(location);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateLocation = async (req, res) => {
  try {
    const { name, latitude, longitude, radiusMeters, description, isActive } = req.body;

    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.admin._id },
      {
        name,
        latitude,
        longitude,
        radiusMeters,
        description,
        isActive,
      },
      { new: true, runValidators: true }
    );

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json(location);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteLocation = async (req, res) => {
  try {
    const location = await Location.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.admin._id,
    });

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
};
