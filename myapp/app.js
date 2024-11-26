const express = require('express');
const app = express();
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const subprocess = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const cors = require('cors');

const PORT = 3000;

const https = require('https');

app.use(cors());

// // Load SSL certificate and key
// let sslOptions;
// try {
//   sslOptions = {
//     key: fs.readFileSync('/etc/letsencrypt/live/chickenpotpie.cse356.compas.cs.stonybrook.edu/privkey.pem'),
//     cert: fs.readFileSync('/etc/letsencrypt/live/chickenpotpie.cse356.compas.cs.stonybrook.edu/fullchain.pem'),
//   };
//   console.log('SSL certificates loaded successfully.');
// } catch (error) {
//   console.error('Error loading SSL certificates:', error);
//   process.exit(1); // Exit if SSL certificates cannot be loaded
// }

// // Redirect HTTP to HTTPS
// const http = require('http');
// http.createServer((req, res) => {
//   res.writeHead(301, { 'Location': 'https://' + req.headers['host'] + req.url });
//   res.end();
// }).listen(80, () => {
//   console.log('HTTP Server running on port 80 (redirecting to HTTPS)');
// });

// // Start HTTPS server
// https.createServer(sslOptions, app).listen(3000, () => {
//   console.log('HTTPS Server running on port 3000');
// }).on('error', (err) => {
//   console.error('Failed to start HTTPS server:', err);
// });

app.set('trust proxy', 1);


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join('/mnt/storage', 'uploads');
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + '-' + file.originalname;
        cb(null, filename);
    }
});

const upload = multer({
    limits: { fileSize: 500 * 1024 * 1024 }, // Adjust as needed
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype !== 'video/mp4') {
            return cb(new Error('Only MP4 videos are allowed'), false);
        }
        cb(null, true);
    }
}).single('mp4File');

app.use(bodyParser.json());

app.use(
	session({
		secret: 'your_secret_key',
		resave: false,
		saveUninitialized: false,
		store: MongoStore.create({ mongoUrl: 'mongodb://130.245.136.26:27017/session_db' }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 }, //1 day
	})
);


// Logging middleware
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
	console.log("Headers:", req.headers);
	console.log("Body:", req.body);
	console.log("Session:", req.session);
	next();
});

app.use((req, res, next) => {
	res.setHeader('X-CSE356', '66d1c9697f77bf55c5004757');
	next();
});

app.use(express.static(path.join('/mnt/storage', 'templates')));
app.use('/media', express.static(path.join('/mnt/storage', 'media')));
// app.use('/testing', express.static(path.join('/mnt/storage', 'testing')));
app.use('/videos', express.static(path.join('/mnt/storage', 'videos')));
// Serve static files from the 'templates' directory
app.use('/templates', express.static(path.join('/mnt/storage', 'templates')));
//app.use('/processed_videos', express.static(path.join('/mnt/storage', 'processed_videos')));
app.use('/thumbnails', express.static(path.join('/mnt/storage', 'thumbnails')));

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(200).json({
	  status: 'ERROR',
	  error: true,
	  message: err.message || 'Internal server error',
	});
  });
  
mongoose.connect('mongodb://130.245.136.26:27017/user_db', {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	host: '130.245.136.26',
	port: 25,
	secure: false,
	tls: {
		rejectUnauthorized: false,
	},
});

transporter.verify(function (error, success) {
	if(error) {
		console.log('Mail server connection error:', error);
	} else {
		console.log('Mail server ready');
	}
});

function isAuthenticated(req, res, next) {
	if (req.session && req.session.username) {
	  return next();
	} else {
	  if (req.accepts('html', 'xml', 'text')) {
		res.status(200).json({
			status: 'ERROR',
			error: true,
			message: 'Unauthorized',
		});
		} else {
			return res.sendFile(path.join('/mnt/storage', 'templates', 'login.html'));
		}
	}
  }
  
app.get('/', (req, res) => {
    if (req.session.username) {
        // User is logged in, serve the media player directly
        return res.sendFile(path.join('/mnt/storage', 'templates', 'videos.html'));
    } else {
        // User is not logged in, serve the login page
        return res.sendFile(path.join('/mnt/storage', 'templates', 'login.html'));
    }
});


app.get('/register', (req, res) => {
	res.sendFile(path.join('/mnt/storage', 'templates', 'adduser.html'));
});

app.get('/login_page', (req, res) => {
	res.sendFile(path.join('/mnt/storage', 'templates', 'login.html'));
});


const User = require('./models/User');
const Video = require('./models/Video');
const crypto = require('crypto');

app.post('/api/adduser', async (req, res) => {
	try {
		const { username, password, email } = req.body;

		if(await User.findOne({ username })) {
			console.log('Username already exists');
			return res.status(200).json({ status: 'ERROR', error: true, message: 'Username already exists' });
		}

		if(await User.findOne({ email })) {
			console.log('Email already exists');
			return res.status(200).json({ status: 'ERROR', error: true, message: 'Email already exists' });
		}
		
		const key = crypto.randomBytes(16).toString('hex');
		console.log('Generated key:', key);

		const user = new User({ username, password, email, verified: false, viewedVideos: [], key });
		await user.save();

		const params = `email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`;
		console.log('Parameters:', params);
		//const encodedParams = new URLSearchParams(params).toString();
		const verificationLink = `https://chickenpotpie.cse356.compas.cs.stonybrook.edu/api/verify?${params}`;
		console.log(verificationLink);

		const mailOptions = {
			from: 'noreply@chickenpotpie.com',
			to: email,
			subject: 'Email Verification',
			text: `Please verify your email by clicking the following link:\n\n<${verificationLink}>`,
		};

		transporter.sendMail(mailOptions, (error, info) => {
			if(error) {
				console.error('Error sending email:', error);
			} else {
				console.log('Email sent:', info.response);
			}
		});
		console.log('User created. Check email for verification link.');
		return res.status(200).json({ status: 'OK', message: 'User created. Check email for verification link.' });
	} catch(e) {
		console.log('Error creating user');
		return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
	}
});

app.get('/api/verify', async (req, res) => {
    const { email, key } = req.query;

    if (!email || !key) {
        console.log('Missing email or key in the request');
        return res.status(200).json({
            status: 'ERROR',
            error: true,
            message: 'Missing email or key in the request',
        });
    }

    try {
        const user = await User.findOne({ email, key });
        if (user) {
            user.verified = true;
            await user.save();
            console.log('Email verified successfully!');
            return res.status(200).json({
                status: 'OK',
                message: 'Email verified successfully!',
            });
        } else {
            console.log('Invalid verification link');
            return res.status(200).json({
                status: 'ERROR',
                error: true,
                message: 'Invalid verification link',
            });
        }
    } catch (e) {
        console.log('Error verifying user:', e);
        return res.status(200).json({
            status: 'ERROR',
            error: true,
            message: e.message,
        });
    }
});

app.post('/api/like', isAuthenticated, async (req, res) => {
    let { id, value } = req.body;

    // Parse 'value' to appropriate type
    if (value === 'true' || value === true) value = true;
    else if (value === 'false' || value === false) value = false;
    else if (value === 'null' || value === null || value === '') value = null;
    else {
        return res.status(200).json({ status: "ERROR", error: true, message: "Invalid value parameter" });
    }

    // Validate parameters
    if (!id || typeof value === 'undefined') {
        return res.status(200).json({ status: "ERROR", error: true, message: "LIKE FUNCTION MISSING PARAMETERS" });
    }

    try {
        const username = req.session.username;
        const video = await Video.findOne({ id }, { likes: { $elemMatch: { userId: username } }, likesCount: 1 });

        if (!video) {
            return res.status(200).json({ status: "ERROR", error: true, message: "Video not found" });
        }

        // Check if user already liked/disliked and update accordingly
        const userLike = video.likes && video.likes[0];
        let incValue = 0;

        if (value === null) {
            // Remove like/dislike
            if (userLike) {
                incValue = (userLike.value === true ? -1 : 0);
                await Video.updateOne(
                    { id },
                    {
                        $pull: { likes: { userId: username } },
                        $inc: { likesCount: incValue }
                    }
                );
            }
        } else {
            if (userLike && userLike.value === value) {
                // User is attempting to relike or redislike (no change in value)
                return res.status(200).json({ status: "ERROR", error: true, message: "NO CHANGE IN LIKE/DISLIKE" });
            }

            // Update or add like
            incValue = (value === true ? 1 : 0) - (userLike ? (userLike.value === true ? 1 : 0) : 0);

            if (userLike) {
                // Update existing like/dislike
                await Video.updateOne(
                    { id, 'likes.userId': username },
                    {
                        $set: { 'likes.$.value': value },
                        $inc: { likesCount: incValue }
                    }
                );
            } else {
                // Add new like
                await Video.updateOne(
                    { id },
                    {
                        $push: { likes: { userId: username, value } },
                        $inc: { likesCount: incValue }
                    }
                );
            }
        }

        // Return the updated likes count
        return res.status(200).json({ status: "OK", likes: video.likesCount });

    } catch (e) {
        console.error("Error liking/disliking: ", e);
        return res.status(200).json({ status: "ERROR", error: true, message: e.message });
    }
});

app.get('/api/like_state/:id', isAuthenticated, async (req, res) => {
    const videoId = req.params.id;
  
    try {
      let video = await Video.findOne({ id: videoId })
  
      if (!video) {
        //video = await Video.findById(videoId);
  
        if (!video) {
          return res.status(200).json({
            status: "ERROR",
            error: true,
            message: "VIDEO NOT FOUND"
          });
        }
      }
        const userLike = video.likes.find(like => like.userId === req.session.username);
        const userLikeState = userLike ? userLike.value : null;
        const likesCount = video.likes.filter(like => like.value === true).length;

        return res.status(200).json({
            status: "OK",
            userLikeState: userLikeState,
            likes: likesCount
        });
    } catch (e) {
        console.error("Error fetching like state: ", e);
        return res.status(200).json({
            status: "ERROR",
            error: true,
            message: e.message
        });
    }
});

// Collaborative Filtering Helper Functions
async function getUserRatings(username) {
    // console.log("In getUserRatings");
    const likedVideos = await Video.find({ 'likes.userId': username });
    const ratings = {};
    likedVideos.forEach(video => {
        const likeEntry = video.likes.find(like => like.userId === username);
        if (likeEntry) {
            ratings[video.id] = likeEntry.value ? 1 : -1; // Map true to +1, false to -1
        }
    });
    return ratings;
}

async function getUserViews(username) {
    console.log("In getUserViews");

    // Find the user by username
    const user = await User.findOne({ username });

    // Check if the user exists
    if (!user) {
        throw new Error('User not found: ', username);
    }

    // Map over the viewedVideos array to return an array of videoId's
    console.log(user);
    // console.log(user.viewedVideos.map(view => view.videoId));
    return user.viewedVideos.map(view => view.videoId);
}

async function isVideoWatchedByUser(userId, videoId) {
    console.log("isVideoWatchedByUser");
    const video = await Video.findOne({ id: videoId });

    if (!video) {
        return false; // Video not found
    }

    // Check if the userId is in the views array of the video
    return video.views.some(view => view.userId === userId);
}


async function getVideoInteractions(videoId) {
    // console.log("In getVideoInteractions");
    const video = await Video.findOne({ id: videoId });

    if (!video) {
        return {};
    }

    const interactionVector = {};

    video.likes.forEach(({ userId, value }) => {
        interactionVector[userId] = value !== null ? (value ? 1 : 0) : null;
    });

    return interactionVector;
}

async function getUserVideoLikeStatus(userId, videoId) {
    console.log("In getUserVideoLikeStatus");
    const video = await Video.findOne({ id: videoId });

    if (!video) {
        return null;  // Video not found
    }

    // Find the like status of the user in the video's likes array
    const likeStatus = video.likes.find(like => like.userId === userId);

    // If the user has liked the video, return true, else return null
    return likeStatus ? likeStatus.value : null;
}

function computeCosineSimilarityRatings(ratingsA, ratingsB) {
    // console.log("In computeCosineSimilarityRatings");
    const commonVideos = Object.keys(ratingsA).filter(videoId => videoId in ratingsB);

    if (commonVideos.length === 0) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    commonVideos.forEach(videoId => {
        const ratingA = ratingsA[videoId];
        const ratingB = ratingsB[videoId];
        dotProduct += ratingA * ratingB;
        magnitudeA += ratingA * ratingA;
        magnitudeB += ratingB * ratingB;
    });

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
}

function computeCosineSimilarityInteractions(interactionsA, interactionsB) {
    // console.log("In computeCosineSimilarityInteractions");
    const commonUsers = Object.keys(interactionsA).filter(user => interactionsB[user] !== undefined);

    if (commonUsers.length === 0) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const user of commonUsers) {
        const ratingA = interactionsA[user];
        const ratingB = interactionsB[user];
        if (ratingA !== null && ratingB !== null) {
            dotProduct += ratingA * ratingB;
            magnitudeA += ratingA * ratingA;
            magnitudeB += ratingB * ratingB;
        }
    }

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}


async function predictRatings(activeUserRatings, topUsers) {
    console.log("In predictRatings");
    const predictedRatings = {};

    for (const { username, similarity } of topUsers) {
        const userRatings = await getUserRatings(username);

        for (const [videoId, rating] of Object.entries(userRatings)) {
            if (!(videoId in activeUserRatings)) {
                if (!(videoId in predictedRatings)) {
                    predictedRatings[videoId] = { weightedSum: 0, sumOfWeights: 0 };
                }
                predictedRatings[videoId].weightedSum += similarity * rating;
                predictedRatings[videoId].sumOfWeights += Math.abs(similarity);
            }
        }
    }

    for (const videoId in predictedRatings) {
        const { weightedSum, sumOfWeights } = predictedRatings[videoId];
        predictedRatings[videoId] = sumOfWeights !== 0 ? (weightedSum / sumOfWeights) : 0;
    }

    return predictedRatings;
}

async function selectTopVideos(predictedRatings, activeUserRatings, activeUserViews, count) {
    console.log("In selectTopVideos");
    const videoIds = Object.keys(predictedRatings);

    // Exclude videos the user has already viewed
    const unviewedVideoIds = videoIds.filter(videoId => !activeUserViews.includes(videoId));

    // Sort the unviewed videos based on predicted ratings
    unviewedVideoIds.sort((a, b) => predictedRatings[b] - predictedRatings[a]);

    let recommendedVideoIds = unviewedVideoIds.slice(0, count);

    // If not enough videos, fill with random unwatched videos
    if (recommendedVideoIds.length < count) {
        const needed = count - recommendedVideoIds.length;
        const additionalVideos = await Video.find({
            id: { $nin: [...recommendedVideoIds, ...activeUserViews] },
            processingStatus: 'complete'
        }).limit(needed);

        recommendedVideoIds = recommendedVideoIds.concat(additionalVideos.map(video => video.id));
    }

    // If still not enough, fill with random videos, including watched ones
    if (recommendedVideoIds.length < count) {
        const needed = count - recommendedVideoIds.length;
        const additionalVideos = await Video.find({
            id: { $nin: recommendedVideoIds },
            processingStatus: 'complete'
        }).limit(needed);

        recommendedVideoIds = recommendedVideoIds.concat(additionalVideos.map(video => video.id));
    }

    // Limit to requested count
    recommendedVideoIds = recommendedVideoIds.slice(0, count);

    return recommendedVideoIds;
}

async function formatVideosResponse(videoIds, activeUsername) {
    console.log("In formatVideosReponse");
    const videos = await Video.find({ id: { $in: videoIds } });

    return videos.map(video => {
        const userLikeEntry = video.likes.find(like => like.userId === activeUsername);
        const liked = userLikeEntry ? (userLikeEntry.value === true ? true : false) : null;
        const watched = video.views.some(view => view.userId === activeUsername);

        return {
            id: video.id,
            description: video.description,
            title: video.title,
            watched,
            liked,
            likevalues: video.likes.filter(like => like.value === true).length,
        };
    });
}

app.post('/api/videos', isAuthenticated, async (req, res) => {
    console.log("In api/videos");
    const { videoId } = req.body;
    let count = parseInt(req.body.count);
    const activeUsername = req.session.username;
    const N = 5;

    if (isNaN(count) || count <= 0) {
        return res.status(200).json({ status: 'ERROR', error: true, message: 'Missing or invalid count parameter' });
    }

    if (!videoId) {
        // User-based collaborative filtering
        try {
            const activeUserRatings = await getUserRatings(activeUsername);
            const activeUserViews = await getUserViews(activeUsername);

            const otherUsers = await User.find({ username: { $ne: activeUsername } });

            const similarities = [];
            for (const user of otherUsers) {
                const otherUserRatings = await getUserRatings(user.username);
                const similarity = computeCosineSimilarityRatings(activeUserRatings, otherUserRatings);
                if (similarity > 0) {
                    similarities.push({ username: user.username, similarity });
                }
            }

            similarities.sort((a, b) => b.similarity - a.similarity);
            const topUsers = similarities.slice(0, N);

            const predictedRatings = await predictRatings(activeUserRatings, topUsers);
            const recommendedVideoIds = await selectTopVideos(predictedRatings, activeUserRatings, activeUserViews, count);

            // const filteredVideoIds = recommendedVideoIds.filter(videoId => !activeUserViews.includes(videoId));
            // const responseVideos = await formatVideosResponse(filteredVideoIds, activeUsername);

            const responseVideos = await formatVideosResponse(recommendedVideoIds, activeUsername);

            return res.status(200).json({ status: 'OK', videos: responseVideos });
        } catch (e) {
            console.error("Error in /api/videos:", e);
            return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
        }
    } else {
        // Item-based collaborative filtering
        try {
            // const videoInteractions = await getVideoInteractions(videoId);

            // // Fetch all videos once and filter out the ones the user has already viewed
            // const allVideos = await Video.find({});
            // const activeUserViews = await getUserViews(activeUsername);  // Get the viewed videos
            
            const [videoInteractions, allVideos, activeUserViews] = await Promise.all([
                getVideoInteractions(videoId),
                Video.find({}),
                getUserViews(activeUsername)
            ])

            const videoSimilarities = [];
    
            // Pre-fetch all videos' interaction data in parallel
            const videoInteractionsMap = await Promise.all(allVideos.map(async (video) => {
                if (video.id !== videoId && !activeUserViews.includes(video.id)) {
                    return {
                        videoId: video.id,
                        interactions: await getVideoInteractions(video.id)
                    };
                }
                return null;
            }));

            // Filter out null values
            const validVideos = videoInteractionsMap.filter(item => item !== null);

            // Compute similarities in parallel
            validVideos.forEach(({ videoId, interactions }) => {
                const similarity = computeCosineSimilarityInteractions(videoInteractions, interactions);
                if (similarity > 0) {
                    videoSimilarities.push({ videoId, similarity });
                }
            });

            // Sort by similarity and get the top N similar videos
            videoSimilarities.sort((a, b) => b.similarity - a.similarity);
            const topSimilarVideos = videoSimilarities.slice(0, count);
    
            // Batch fetch all necessary video details in one query
            const videoIds = topSimilarVideos.map(({ videoId }) => videoId);
            const videos = await Video.find({ id: { $in: videoIds } });

            // Prepare response with necessary details in parallel
            const responseVideos = await Promise.all(topSimilarVideos.map(async ({ videoId, similarity }) => {
                const video = videos.find(v => v.id === videoId);
                if (!video) return null; // Skip if video is not found
                
                const [watched, liked] = await Promise.all([
                    isVideoWatchedByUser(activeUsername, videoId),
                    getUserVideoLikeStatus(activeUsername, videoId)
                ]);

                return {
                    id: video.id,
                    description: video.description,
                    title: video.title,
                    watched,
                    liked,
                    likevalues: similarity
                };
            }));

            // Filter out any null values
            const filteredResponseVideos = responseVideos.filter(video => video !== null);

            return res.status(200).json({ status: 'OK', videos: filteredResponseVideos });
            
        } catch (e) {
            console.error("Error in /api/videos:", e);
            return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
        }
    }
});


const Queue = require('bull');

// Create a new queue named 'video-processing'
const videoProcessingQueue = new Queue('video-processing', {
  redis: { port: 6379, host: '127.0.0.1' },
});

// videoProcessingQueue.process(async (job) => {
//     const { jobType, videoId, videoPath } = job.data;
//     try {
//         if (jobType === 'thumbnail') {
//             // Generate thumbnail
//             const thumbnailPath = path.join('/mnt/storage', 'thumbnails', `${videoId}_thumbnail.jpg`);
//             const generateThumbnailCommand = [
//                 'ffmpeg', '-i', videoPath,
//                 '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black',
//                 '-frames:v', '1', thumbnailPath, '-y',
//             ];
//             await executeFFmpegCommand(generateThumbnailCommand);
//             console.log(`Thumbnail generated for ${videoId}`);
//         } else if (jobType === 'processing') {
//             // Process video
//             const outputFile = path.join('/mnt/storage', 'media', `${videoId}.mpd`);
//             const ffmpegCommand = [
//                 'ffmpeg', '-i', videoPath,
//                 // Your FFmpeg parameters
//                 '-map', '0:v', '-b:v:0', '512k', '-s:v:0', '640x360',
//                 '-map', '0:v', '-b:v:1', '768k', '-s:v:1', '960x540',
//                 '-map', '0:v', '-b:v:2', '1024k', '-s:v:2', '1280x720',
//                 '-use_template', '1', '-use_timeline', '1', '-seg_duration', '10',
//                 '-init_seg_name', `${videoId}_init_$RepresentationID$.m4s`,
//                 '-media_seg_name', `${videoId}_chunk_$Bandwidth$_$Number$.m4s`,
//                 '-adaptation_sets', 'id=0,streams=v',
//                 '-f', 'dash', outputFile,
//             ];
//             await executeFFmpegCommand(ffmpegCommand);
//             // Update video status to 'complete'
//             await Video.updateOne({ id: videoId }, { processingStatus: 'complete' });
//             console.log(`Video processing completed for ${videoId}`);
//         }
//     } catch (error) {
//         console.error(`Error processing ${jobType} for video ${videoId}:`, error);
//         await Video.updateOne({ id: videoId }, { processingStatus: 'failed' });
//     }
// });

  
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
  

  app.post('/api/upload', isAuthenticated, upload, async (req, res) => {
    console.log("In api/upload");
    const author = req.session.username;
    const { title, description } = req.body;
    const mp4File = req.file;

    if (!author || !title || !description || !mp4File) {
        return res.status(400).json({
            error: "Upload function missing parameters"
        });
    }

    try {
        const fileName = path.basename(mp4File.path, ".mp4");
        console.log('Uploaded file:', mp4File);
        console.log('File name:', fileName);

        const videoPath = mp4File.path;

        const videoId = title + author + Date.now();

        const video = new Video({
            id: videoId,
            author: author,
            title: title,
            description: description,
            likes: [],
            views: [],
            processingStatus: "processing"
        });

        video.save();

        // Ensure directories exist
        // await fs.promises.mkdir(path.join('/mnt/storage', 'thumbnails'), { recursive: true });
        // await fs.promises.mkdir(path.join('/mnt/storage', 'media'), { recursive: true });

        // Enqueue thumbnail generation
        videoProcessingQueue.add({
            jobType: 'thumbnail',
            videoId: videoId,
            videoPath: videoPath,
        });

        // Enqueue video processing
        videoProcessingQueue.add({
            jobType: 'processing',
            videoId: video.id,
            videoPath: videoPath,
        });

        // Return the response immediately
        return res.status(200).json({
            status: "OK",
            error: false,
            id: video.id
        });

    } catch (e) {
        console.error("Error uploading video: ", e);
        return res.status(500).json({
            error: e.message
        });
    }
});

app.post('/api/view', isAuthenticated, async (req, res) => {
    console.log("In api/view");
    const { id } = req.body;

    // Check if the id parameter is provided
    if (!id) {
        return res.status(200).json({
            status: "ERROR",
            error: true,
            message: "VIEW FUNCTION MISSING PARAMETERS"
        });
    }

    try {
        // Find the video by id
        let video = await Video.findOne({ id: `${id}` });

        if (!video) {
            return res.status(200).json({
                status: "ERROR", 
                error: true,
                message: "VIDEO NOT FOUND"
            });
        }

        // Check if the user has already viewed the video
        const userView = video.views.find(view => view.userId === req.session.username);

        if (userView) {
            // If the user has already viewed the video, return the response
            return res.status(200).json({
                status: "OK",
                viewed: true
            });
        } else {
            // If the user has not viewed the video, add the view to the Video schema
            video.views.push({
                userId: req.session.username
            });
            await video.save();

            // Also, update the User schema to track this video as viewed
            await User.findOneAndUpdate(
                { username: req.session.username },
                {
                    $push: {
                        viewedVideos: {
                            videoId: id
                        }
                    }
                }
            );

            return res.status(200).json({
                status: "OK",
                viewed: false
            });
        }

    } catch (e) {
        console.error("Error processing view: ", e);
        res.status(200).json({
            status: "ERROR",
            error: true,
            message: e.message
        });
    }
});

app.get('/upload', isAuthenticated, async (req, res) => {
	res.sendFile(path.join('/mnt/storage', 'templates', 'upload.html'));
})

app.get('/api/processing-status', async (req, res) => {
	// IMPLEMENT
	try {

		// Fetch all videos associated with user
		const videos = await Video.find({ author: req.session.username });

		const result = videos.map(video => ({
			id: video.id,
			title: video.title,
			status: video.processingStatus
		}))

		return res.status(200).json({
            status: "OK",
            error: false,
			videos: result
		})

	} catch (e) {
		console.error("Error fetching processing-status: ", e);
		return res.status(200).json({
			status: "ERROR",
			error: true,
			message: e.message
		})
	}
})



app.post('/api/login', async (req, res) => {
	const { username, password } = req.body;
  
	try {
	  	const user = await User.findOne({ username, password, verified: true });
	  	if (user) {
			req.session.username = username;
			console.log('Logged in successfully!');
			return res.status(200).json({ status: 'OK', message: 'Logged in successfully!' });
	  	} else {
			console.log('Invalid credentials or unverified email.');
			return res.status(200).json({ status: 'ERROR', error: true, message: 'Invalid credentials or unverified email.' });
	  	}
	} catch (e) {
		console.log('Error logging in');
	  	return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
	}
});

app.post('/api/logout', (req, res) => {
	req.session.destroy();
	console.log('Logged out successfully!');
	return res.status(200).json({ status: 'OK', message: 'Logged out successfully!' });
});

app.post('/api/check-auth', (req, res) => {
	if (req.session && req.session.username) {
		return res.status(200).json({ isLoggedIn: true, userId: req.session.username });
	} else {
		return res.status(200).json({ isLoggedIn: false, userId: req.session.username });
	}
})

const videosDir = path.join('/mnt/storage/videos');

let videoMetadata = {};
const metadataPath = path.join(videosDir, 'm2.json');

try {
	const metadata = fs.readFileSync(metadataPath, 'utf-8');
	videoMetadata = JSON.parse(metadata);
} catch(error) {
	console.error('Error reading m2.json:', error);
}

const generateThumbnail = (videoPath, thumbnailPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .on('end', () => {
                console.log(`Thumbnail generated at ${thumbnailPath}`);
                resolve(thumbnailPath);
            })
            .on('error', (e) => {
                console.error("Error generating thumbnail:", e);
                reject(e);
            })
            // Specify the output file
            .output(thumbnailPath)
            // Disable audio processing
            .noAudio()
            // Take only one frame
            .frames(1)
            // Apply scaling and padding filters
            .videoFilters([
                'scale=320:180:force_original_aspect_ratio=decrease',
                'pad=320:180:(ow-iw)/2:(oh-ih)/2:black'
            ])
            // Seek to the first frame (timemark 0)
            .seekInput(0)
            // Execute the FFmpeg command
            .run();
    });
};


// app.get('/api/thumbnail/:id', async (req, res) => {
// 	const videoId = req.params.id;
// 	const videoPath = path.join('/mnt/storage', "videos", `${videoId}.mp4`);
//     const thumbnailPath = path.join('/mnt/storage', "thumbnails", `${videoId}.jpg`);
		
// 	// Check if user is logged in
// 	if (!req.session.username) {
// 		return res.status(200).json({ status: "ERROR", error: true, message: "Not logged in" });
// 	}
	
// 	// Check if the thumbnail file exists
// 	fs.stat(thumbnailPath, (err) => {
// 		if (err) {
// 			// If the file does not exist, send an error response
// 			console.error(err);
// 			return res.status(404).json({ status: "ERROR", error: true, message: "Thumbnail not found" });
// 		}

// 		// Send the existing thumbnail file
// 		res.sendFile(thumbnailPath);
// 	});
// })

app.get('/api/thumbnail/:id', async (req, res) => {
    const videoId = req.params.id;
    const thumbnailPath = path.join('/mnt/storage', "thumbnails", `${videoId}_thumbnail.jpg`);
    
    // Check if user is logged in
    if (!req.session.username) {
        return res.status(200).json({ status: "ERROR", error: true, message: "Not logged in" });
    }
    
    // Check if the thumbnail file exists
    fs.stat(thumbnailPath, (err) => {
        if (err) {
            console.error('Thumbnail not found:', thumbnailPath);
            return res.status(404).json({ status: "ERROR", error: true, message: "Thumbnail not found" });
        }
    
        // Send the existing thumbnail file
        res.sendFile(thumbnailPath);
    });
});

app.get('/videos', isAuthenticated, async (req, res) => {
    try {
        const count = parseInt(req.query.count) || 10;
        const page = parseInt(req.query.page) || 0;

        // Fetch the list of video files (e.g., from the file system)
        const files = fs.readdirSync(videosDir);
        const videoFiles = files.filter(file => path.extname(file).toLowerCase() === '.mp4');

        // Get the starting index based on pagination
        const startIndex = page * count;
        const selectedVideoFiles = videoFiles.slice(startIndex, startIndex + count);

        // Fetch videos from the database and filter based on whether the user has viewed them
        const videos = await Promise.all(
            selectedVideoFiles.map(async (file) => {
                const title = path.basename(file, '.mp4');

                // Find the video in the database by its title/id
                const video = await Video.findOne({ id: title });
                // console.log(video);

                // If the video exists, check if the user has already viewed it
                if (video) {
                    const userHasViewed = video.views.some(view => view.userId === req.session.username);
                    
                    // If the user hasn't viewed this video, return it; otherwise, skip it
                    // if (!userHasViewed) {
                        return {
                            id: title,
                            thumbnail: `api/thumbnail/${title}`,
                            description: video.description,
                        };
                    // }
                }
                return null; // If video doesn't exist or user has viewed, return null
            })
        );
        console.log("VIDEOS: ", videos);

        // Filter out null values (videos that the user has already viewed or that don't exist)
        const filteredVideos = videos.filter(video => video !== null);

        // Return the filtered list of videos
        res.status(200).json({ status: "OK", videos: filteredVideos });
    } catch (error) {
        console.error("Error fetching videos:", error);
        res.status(200).json({ status: "ERROR", message: error.message });
    }
});

app.get('/media/:filename', isAuthenticated, (req, res) => {
  
	const { filename } = req.params;
	const filePath = path.join('/mnt/storage', 'media', filename);
  
	fs.access(filePath, fs.constants.F_OK, (err) => {
	  if (err) {
		console.error('File not found at:', filePath);
		return res.status(200).json({
		  status: 'ERROR',
		  error: true,
		  message: 'Media segment not found',
		});
	  } else {
		res.sendFile(filePath, (err) => {
		  if (err) {
			console.error('Error sending media segment:', err);
			if (!res.headersSent) {
			  res.status(200).json({
				status: 'ERROR',
				error: true,
				message: 'Error sending media segment',
			  });
			}
		  }
		});
	  }
	});
  });
  

app.get('/media/:videoId/:segment', isAuthenticated, (req, res) => {
	
	const { videoId, segment } = req.params;
	const filePath = path.join('/mnt/storage', 'media', `${videoId}.mp4`);
  
	res.sendFile(filePath, (err) => {
	  if (err) {
		console.error('Error sending media segment:', err);
		return res.status(200).json({
		  status: 'ERROR',
		  error: true,
		  message: 'Media segment not found',
		});
	  }
	});
  });
  
  app.get('/media/chunks/:videoId_chunk_:bandwidth_:segmentNumber.m4s', isAuthenticated, (req, res) => {
    const { videoId, bandwidth, segmentNumber } = req.params;
    let fileName;

    if (segmentNumber === 'init') {
        fileName = `${videoId}_chunk_${bandwidth}_init.m4s`;
    } else {
        fileName = `${videoId}_chunk_${bandwidth}_${segmentNumber}.m4s`;
    }

    const filePath = path.join('/mnt/storage', 'media', fileName);

    console.log(`Requested chunk: ${fileName}, Path: ${filePath}`);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error('Media segment not found at:', filePath);
            return res.status(200).json({
                status: 'ERROR',
                error: true,
                message: 'Media segment not found',
            });
        } else {
            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error('Error sending media segment:', err);
                    if (!res.headersSent) {
                        res.status(200).json({
                            status: 'ERROR',
                            error: true,
                            message: 'Error sending media segment',
                        });
                    }
                }
            });
        }
    });
});



app.get('/api/manifest/:id', isAuthenticated, (req, res) => {
    console.log("Requested Manifest for Video ID:", req.params.id);

    const videoId = req.params.id;
    const manifestPath = path.join('/mnt/storage', 'media', `${videoId}.mpd`);

	fs.readFile(manifestPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Manifest not found at:', manifestPath);
            return res.status(200).json({
                status: 'ERROR',
                error: true,
                message: 'Manifest not found',
            });
        } else {
            // Inject BaseURL into the manifest
            const baseUrlTag = '<BaseURL>/media/</BaseURL>';
            let modifiedManifest = data;

            if (data.includes('<BaseURL>')) {
                // If BaseURL already exists, replace it
                modifiedManifest = data.replace(/<BaseURL>.*<\/BaseURL>/, baseUrlTag);
            } else {
                // Insert BaseURL after the opening <MPD> tag
                modifiedManifest = data.replace(/<MPD[^>]*>/, (match) => `${match}\n  ${baseUrlTag}`);
            }

            res.set('Content-Type', 'application/dash+xml');
            res.send(modifiedManifest);
        }
    });
	// res.setHeader('Content-Type', 'application/dash+xml');

    // fs.access(manifestPath, fs.constants.F_OK, (err) => {
    //     if (err) {
    //         console.error('Manifest not found at:', manifestPath);
    //         return res.status(200).json({
    //             status: 'ERROR',
    //             error: true,
    //             message: 'Manifest not found',
    //         });
    //     } else {
    //         console.log('Sending manifest:', manifestPath);
    //         res.sendFile(manifestPath, (err) => {
    //             if (err) {
    //                 console.error('Error sending manifest:', err);
    //                 if (!res.headersSent) {
    //                     res.status(200).json({
    //                         status: 'ERROR',
    //                         error: true,
    //                         message: 'Error sending manifest',
    //                     });
    //                 }
    //             }
    //         });
    //     }
    // });
});

  
app.get('/play/:id', isAuthenticated, async (req, res) => {
    const videoId = req.params.id;
    console.log("ID : ", videoId);

    // View video
    await axios.post('https://chickenpotpie.cse356.compas.cs.stonybrook.edu/api/view', { id: videoId }, {
        headers: { 'Cookie': req.headers.cookie } // Ensure the session cookie is sent
    });

    // Path to the static HTML template
    const templatePath = path.join('/mnt/storage', 'templates', 'mediaplayer.html');

    // Read the HTML file
    fs.readFile(templatePath, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Server error');
        }

        // Replace the placeholder with the actual videoId, properly serialized
        const htmlContent = data.replace('{{videoId}}', JSON.stringify(videoId));

        // Send the modified HTML with the embedded videoId
        res.send(htmlContent);
    });
});


app.get('/player', (req, res) => {
	if (!req.session.username) {
		return res.redirect('/login_page');
	}
	res.sendFile(path.join('/mnt/storage', 'templates', 'videos.html'));
});


// app.listen(PORT, '0.0.0.0', () => {
//     console.log(`Server is running on port ${PORT}`);
// });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});