const { Schema, model } = require('mongoose');
const likeSchema = new Schema({
    userId: {
      type: String,
      required: true,
      index: true,
    },
    videoId: {
      type: String,
      required: true,
      index: true,
    },
    value: {
      type: Boolean,
      required: true,
    },
  });

// Compound index to optimize queries involving both userId and videoId
likeSchema.index({ userId: 1, videoId: 1 });

module.exports = model('Like', likeSchema);  