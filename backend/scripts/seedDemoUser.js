require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User } = require('../models/Schemas');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function seedDemoUser() {
  const useLocalDatabase = process.argv.includes('--local');
  const mongoUri = useLocalDatabase
    ? 'mongodb://127.0.0.1:27017/safebox'
    : requireEnv('MONGO_URI');
  const username = requireEnv('DEMO_USERNAME');
  const email = requireEnv('DEMO_EMAIL').toLowerCase();
  const password = requireEnv('DEMO_PASSWORD');

  if (password.length < 8) throw new Error('DEMO_PASSWORD must contain at least 8 characters');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15_000 });

  try {
    const emailOwner = await User.findOne({ email }).select('username').lean();
    if (emailOwner && emailOwner.username !== username) {
      throw new Error(`DEMO_EMAIL is already assigned to username '${emailOwner.username}'`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await User.updateOne(
      { username },
      {
        $set: { email, passwordHash },
        $setOnInsert: { settings: { emailEnabled: true }, createdAt: new Date() }
      },
      { upsert: true, runValidators: true }
    );

    console.log(`Demo user ready in ${useLocalDatabase ? 'local MongoDB' : 'configured MongoDB'}: username=${username}, email=${email}`);
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoUser().catch((error) => {
  console.error(`Demo user seed failed: ${error.message}`);
  process.exitCode = 1;
});
