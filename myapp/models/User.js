const { Schema, model } = require('mongoose');
const userSchema = new Schema({
  username: { type: String, unique: true },
  password: String,
  email: { type: String, unique: true },
  verified: { type: Boolean, default: false },
  key: String,
});

module.exports = model('User', userSchema);