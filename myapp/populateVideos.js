const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Video = require('./models/Video');  // Adjust the path to where your Video model is defined

// MongoDB connection
mongoose.connect('mongodb://130.245.136.26:27017/user_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Directory where .mpd files are stored
const directoryPath = './media';  // Adjust the path to where your .mpd files are located

// Function to create a new video entry in the database
async function createVideoEntry(videoId) {
  // Create a new video document
  const newVideo = new Video({
    id: videoId,
    author: 'Unknown',  // You can modify this based on how you want to assign authors
    title: `Video ${videoId}`,  // Modify this as needed, e.g., fetch from metadata if available
    description: 'DESCRIPTION',
    createdAt: new Date(),
    likes: [],  // No likes initially
    views: [],  // No views initially
    processingStatus: 'complete'
  });

  try {
    // Save the video document to MongoDB
    await newVideo.save();
    console.log(`Video with ID ${videoId} saved to the database.`);
  } catch (err) {
    console.error(`Error saving video with ID ${videoId}:`, err);
  }
}

// Function to process .mpd files in the directory
async function processMpdFiles() {
  try {
    // Read the directory and filter .mpd files
    const files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.mpd'));

    if (files.length === 0) {
      console.log('No .mpd files found in the directory.');
      return;
    }

    // Process each .mpd file
    for (const file of files) {
      const videoId = path.basename(file, '.mpd');  // Extract the videoId by removing the .mpd extension
      console.log(`Processing file: ${file} with videoId: ${videoId}`);

      // Create a new video entry for each .mpd file
      await createVideoEntry(videoId);
    }
  } catch (err) {
    console.error('Error processing .mpd files:', err);
  }
}

// Run the script to process .mpd files
processMpdFiles().then(() => {
  console.log('Finished processing all .mpd files.');
  mongoose.connection.close();  // Close the connection after processing
});
