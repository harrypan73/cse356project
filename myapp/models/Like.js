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
  
  module.exports = model('Like', likeSchema);  