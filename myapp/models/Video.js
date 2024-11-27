const { Schema, model } = require('mongoose');

const videoSchema = new Schema({
	id: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	author: {
		type: String,
		required: true
	},
	title: {
		type: String,
		required: true
	},
	description: {
		type: String,
		required: true
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	// likes: [
	// 	{
	// 		userId: {
	// 			type: String,
	// 			required: true,
	// 			index: true
	// 		},
	// 		value: {
	// 			type: Boolean,
	// 			required: true,
	// 		}
	// 	}
	// ],
	likesCount: {
		type: Number,
		default: 0
	},
	views: [
		{
			userId: {
				type: String,
				required: true
			}
		}
	],
	processingStatus: {
		type: String,
		enum: ["processing", "complete"],
		default: "processing"
	}
})

module.exports = model('Video', videoSchema);