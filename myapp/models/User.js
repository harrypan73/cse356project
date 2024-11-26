const { Schema, model } = require('mongoose');
const userSchema = new Schema({
  username: { type: String, unique: true },
  password: String,
  email: { type: String, unique: true },
  verified: { type: Boolean, default: false },
  viewedVideos: [
    {
        videoId: { 
          type: String, 
          required: true 
        }
    }
  ],
  key: String,
});

module.exports = model('User', userSchema);