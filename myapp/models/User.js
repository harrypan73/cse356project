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

// Index on viewedVideos to speed up filtering of already viewed videos
userSchema.index({ "viewedVideos.videoId": 1 });

module.exports = model('User', userSchema);