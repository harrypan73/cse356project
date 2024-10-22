const { Schema, model } = require('mongoose');

const videoSchema = new Schema({
	videoId: String,
	title: String,
	description: String,
})

module.exports = mongoose.model('Video', videoSchema);