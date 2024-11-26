const Queue = require('bull');
const path = require('path');
const subprocess = require('child_process');
const Video = require('./models/Video'); 
const mongoose = require('mongoose');

mongoose.connect('mongodb://130.245.136.26:27017/user_db', {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

// Create a new queue named 'video-processing'
const videoProcessingQueue = new Queue('video-processing', {
    redis: { port: 6379, host: '127.0.0.1' },
    limiter: {
      groupKey: 'video-processing',
      max: 1000, // Max jobs per time window (e.g., per second)
      duration: 1000, // Time window in ms
    },
  });
  
videoProcessingQueue.process(5, async (job) => {
    const { jobType, videoId, videoPath } = job.data;
    try {
        if (jobType === 'thumbnail') {
            // Generate thumbnail
            const thumbnailPath = path.join('/mnt/storage', 'thumbnails', `${videoId}_thumbnail.jpg`);
            const generateThumbnailCommand = [
                'ffmpeg', '-threads', '8', '-i', videoPath,
                '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black',
                '-frames:v', '1', thumbnailPath, '-y',
            ];
            await executeFFmpegCommand(generateThumbnailCommand);
            console.log(`Thumbnail generated for ${videoId}`);
        } else if (jobType === 'processing') {
            // Process video
            const outputFile = path.join('/mnt/storage', 'media', `${videoId}.mpd`);
            const ffmpegCommand = [
                'ffmpeg', '-threads', '8', '-i', videoPath,
                // Your FFmpeg parameters
                '-map', '0:v', '-b:v:0', '512k', '-s:v:0', '640x360',
                '-map', '0:v', '-b:v:1', '768k', '-s:v:1', '960x540',
                '-map', '0:v', '-b:v:2', '1024k', '-s:v:2', '1280x720',
                '-use_template', '1', '-use_timeline', '1', '-seg_duration', '10',
                '-init_seg_name', `${videoId}_init_$RepresentationID$.m4s`,
                '-media_seg_name', `${videoId}_chunk_$Bandwidth$_$Number$.m4s`,
                '-adaptation_sets', 'id=0,streams=v',
                '-f', 'dash', outputFile,
            ];
            await executeFFmpegCommand(ffmpegCommand);
            // Update video status to 'complete'
            await Video.updateOne({ id: videoId }, { processingStatus: 'complete' });
            console.log(`Video processing completed for ${videoId}`);
        }
    } catch (error) {
        console.error(`Error processing ${jobType} for video ${videoId}:`, error);
        await Video.updateOne({ id: videoId }, { processingStatus: 'failed' });
    }
});

// Helper function to execute FFmpeg commands
function executeFFmpegCommand(command) {
	return new Promise((resolve, reject) => {
		const process = subprocess.spawn(command[0], command.slice(1));
  
		process.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`FFmpeg exited with code ${code}`));
			}
	  	});
  
	  	process.on('error', (error) => {
			reject(error);
	  	});
	});
}
  
// Clear all jobs from the queue
videoProcessingQueue.empty().then(() => {
    console.log('Queue cleared.');
}).catch((error) => {
    console.error('Error clearing queue:', error);
});
