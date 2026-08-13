const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User } = require('../models/Schemas');
const { authenticateToken } = require('./auth');

// GET /api/v1/users/profile — Fetch current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, error: 'User profile not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/users/profile — Update password & user settings
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const { newPassword, settings } = req.body;
    const updates = {};

    if (newPassword) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (settings !== undefined) {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return res.status(400).json({ success: false, error: 'settings must be an object' });
      }
      if (settings.emailEnabled !== undefined) {
        if (typeof settings.emailEnabled !== 'boolean') {
          return res.status(400).json({ success: false, error: 'emailEnabled must be a boolean' });
        }
        updates['settings.emailEnabled'] = settings.emailEnabled;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!updatedUser) return res.status(404).json({ success: false, error: 'User profile not found' });
    res.json({ success: true, data: updatedUser });
  } catch (err) {
    const status = err instanceof TypeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
