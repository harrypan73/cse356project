const express = require('express');
const app = express();
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

const PORT = 5000;

app.use(bodyParser.json());

app.use(
	session({
		secret: 'your_secret_key',
		resave: false,
		saveUninitialized: false,
		store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/session_db' }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 }, //1 day
	})
);

// Logging middleware
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
	console.log(`Headers:`, req.headers);
	console.log(`Body:`, req.body);
	console.log(`Session:`, req.session);
	next();
});

app.use((req, res, next) => {
	res.setHeader('X-CSE356', '66d1c9697f77bf55c5004757');
	next();
});

app.use(express.static(path.join(__dirname, 'templates')));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
//app.use('/processed_videos', express.static(path.join(__dirname, 'processed_videos')));

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(200).json({
	  status: 'ERROR',
	  error: true,
	  message: err.message || 'Internal server error',
	});
  });
  
mongoose.connect('mongodb://localhost:27017/user_db', {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	host: 'localhost',
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
			return res.sendFile(path.join(__dirname, 'templates', 'login.html'));
		}
	//   } else {
	// 	res.status(200).json({
	// 	  status: 'ERROR',
	// 	  error: true,
	// 	  message: 'Unauthorized access. Please log in first.',
	// 	});
	//   }
	}
  }
  
  

app.get('/', (req, res) => {
if (req.session.username) {
	// User is logged in, serve the media player directly
	return res.sendFile(path.join(__dirname, 'templates', 'videos.html'));
	// return res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'));
} else {
	return res.sendFile(path.join(__dirname, 'templates', 'login.html'));
	return res.status(200).json({
		status: 'ERROR',
		error: true,
		message: 'Unauthorized access. Please log in first.',
	});
}
});

app.get('/register', (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'adduser.html'));
});

app.get('/login_page', (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'login.html'));
});


const User = require('./models/User');
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

		const user = new User({ username, password, email, verified: false, key });
		await user.save();

		const params = `email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`;
		console.log('Parameters:', params);
		//const encodedParams = new URLSearchParams(params).toString();
		const verificationLink = `http://130.245.136.207/api/verify?${params}`;
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

const videosDir = path.join(__dirname, 'videos');

let videoMetadata = {};
const metadataPath = path.join(videosDir, 'm1.json');

try {
	const metadata = fs.readFileSync(metadataPath, 'utf-8');
	videoMetadata = JSON.parse(metadata);
} catch(error) {
	console.error('Error reading m1.json:', error);
}

app.post('/api/videos/', async (req, res) => {
	//const count = parseInt(req.params.count, 10);
	const {count} = req.body;

	if (!count) {
		return res.status(200).json({ status: 'ERROR', error: true, message: 'Missing count parameter' });
	}

	const start = 0;

	try {
		const files = fs.readdirSync(videosDir);

		const videoFiles = files.filter((file) => {
			const extension = path.extname(file).toLowerCase();
			return extension === '.mp4';
		});

		const videos = videoFiles.map((file) => {
			const title = file;
			const description = videoMetadata[title];

			return { id: title.replace(/\.mp4$/, ""), title: title, description: description };
		});

		const selectedVideos = videos.slice(start, start + count);

		return res.status(200).json({ status: 'OK', videos: selectedVideos });
	} catch(e) {
		return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
	}
});

// const generateThumbnail = (videoPath, thumbnailPath) => {
//     return new Promise((resolve, reject) => {
//         ffmpeg(videoPath)
//             .on('end', () => {
//                 console.log(`Thumbnail generated at ${thumbnailPath}`);
//                 resolve(thumbnailPath);
//             })
//             .on('error', (e) => {
//                 console.error("Error generating thumbnail:", e);
//                 reject(e);
//             })
//             // Apply scaling and padding through videoFilters
//             .videoFilters([
//                 'scale=320:180:force_original_aspect_ratio=decrease',
//                 'pad=320:180:(ow-iw)/2:(oh-ih)/2:black'
//             ])
//             .screenshots({
//                 count: 1,
//                 folder: path.dirname(thumbnailPath),
//                 filename: path.basename(thumbnailPath),
//                 // Remove the 'size' option to prevent FFmpeg from adding another -vf
//                 // size: '320x180', // This line should be omitted
//                 timemarks: ['0']
//             });
//     });
// };

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
// 	const videoPath = path.join(__dirname, "videos", `${videoId}.mp4`);
// 	const thumbnailPath = path.join(__dirname, "thumbnails", `${videoId}_thumbnail.jpg`);
// 	try {
// 		//await generateThumbnail(videoPath, thumbnailPath);
// 		res.sendFile(thumbnailPath);
// 	} catch (e) {
// 		console.error(e);
// 		res.status(200).json({status: "ERROR", error: true, "message": e.message})
// 	}
// })

app.get('/api/thumbnail/:id', async (req, res) => {
	const videoId = req.params.id;
	const videoPath = path.join(__dirname, "videos", `${videoId}.mp4`);
	const thumbnailPath = path.join(__dirname, "thumbnails", `${videoId}_thumbnail.jpg`);
		
	// Check if user is logged in
	if (!req.session.username) {
		return res.status(200).json({ status: "ERROR", error: true, message: "Not logged in" });
	}
	
	// Check if the thumbnail file exists
	fs.stat(thumbnailPath, (err) => {
		if (err) {
			// If the file does not exist, send an error response
			console.error(err);
			return res.status(404).json({ status: "ERROR", error: true, message: "Thumbnail not found" });
		}

		// Send the existing thumbnail file
		res.sendFile(thumbnailPath);
	});
})

// app.get("/api/thumbnail/:id", (req, res) => {
// 	const videoId = req.params.id;
// 	const thumbnailPath = path.join(__dirname, `thumbnails/${videoId}_thumbnail.jpg`);
// 	console.log("SKANDOUHWIJXW: ", thumbnailPath)
  
// 	// Check if user is logged in
// 	if (!req.session.user) {
// 	  return res
// 		.status(200)
// 		.json({ status: "ERROR", error: true, message: "Not logged in" });
// 	}
  
// 	// Check if the thumbnail file exists
// 	fs.access(thumbnailPath, fs.constants.F_OK, (err) => {
// 	  if (err) {
// 		console.error(`Thumbnail not found for video ID: ${videoId}`);
// 		return res
// 		  .status(200)
// 		  .json({ status: "ERROR", error: true, message: "Thumbnail not found" });
// 	  }
  
// 	  // Track if client aborts
// 	  req.on("aborted", () => {
// 		console.warn(`Client aborted request for video ID: ${videoId}`);
// 	  });
  
// 	  // Serve the thumbnail file
// 	  res.sendFile(thumbnailPath, (err) => {
// 		if (err) {
// 		  console.error(`Error sending thumbnail for video ID: ${videoId}`, err);
// 		  res.status(200).json({
// 			status: "ERROR",
// 			error: true,
// 			message: "Thumbnail didnt send",
// 		  });
// 		}
// 	  });
// 	});
//   });



  app.get('/videos', async (req, res) => {
	try {
		const files = fs.readdirSync(videosDir);
		const videoPromises = files
			.filter(file => path.extname(file).toLowerCase() === '.mp4')
			.map(async (file) => {
				const title = path.basename(file, '.mp4');
				const videoPath = path.join(__dirname, "videos", file);
				const thumbnailPath = path.join(__dirname, "thumbnails", `${title}.jpg`);

				if (!fs.existsSync(thumbnailPath)) {
					await generateThumbnail(videoPath, thumbnailPath);
				}

				return { id: title, thumbnail: `/videos/${title}.jpg`, description: `Description for ${title}`}
			});

		const videos = await Promise.all(videoPromises);
		res.status(200).json({
			status: "OK",
			videos
		})
	} catch (e) {
		console.log("Error fetching videos: ", e);
		return res.status(200).json({
			status: "ERROR",
			error: true,
			message: e.message
		})
	}})

// app.get('/videos', async (req, res) => {
// 	// Authentication check
// 	if (!req.session.username) {
// 	  return res.status(200).json({
// 		status: 'ERROR',
// 		error: true,
// 		message: 'Unauthorized access. Please log in first.',
// 	  });
// 	}
  
// 	const page = parseInt(req.query.page) || 0;
// 	const size = parseInt(req.query.size) || 10;
  
// 	try {
// 	  const files = fs.readdirSync(videosDir);
  
// 	  const videoFiles = files.filter(file => path.extname(file).toLowerCase() === '.mp4');
  
// 	  const videos = videoFiles.map(file => {
// 		const title = path.basename(file, '.mp4');
// 		const description = videoMetadata[title] || `Description for ${title}`;
  
// 		return { id: title, title: title, description: description };
// 	  });
  
// 	  // Implement pagination
// 	  const start = page * size;
// 	  const end = start + size;
// 	  const selectedVideos = videos.slice(start, end);
  
// 	  res.status(200).json({
// 		status: "OK",
// 		videos: selectedVideos
// 	  });
// 	} catch (e) {
// 	  console.log("Error fetching videos: ", e);
// 	  return res.status(200).json({
// 		status: "ERROR",
// 		error: true,
// 		message: e.message
// 	  });
// 	}
//   });
  
// Protected media routes with authentication middleware
// app.get('/videos/media/output.mpd', isAuthenticated, (req, res) => {
// 	const filePath = path.join(__dirname, 'static', 'media', 'output.mpd');
// 	res.sendFile(filePath);
// });

app.get('/media/:filename', isAuthenticated, (req, res) => {
	// Authentication check
	// if (!(req.session && req.session.username)) {
	//   return res.status(200).json({
	// 	status: 'ERROR',
	// 	error: true,
	// 	message: 'Unauthorized access. Please log in first.',
	//   });
	// }
  
	const { filename } = req.params;
	const filePath = path.join(__dirname, 'media', filename);
  
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
	// if (!(req.session && req.session.username)) {
	// 	return res.status(200).json({
	// 	  status: 'ERROR',
	// 	  error: true,
	// 	  message: 'Unauthorized access. Please log in first.',
	// 	});
	//   }
	
	const { videoId, segment } = req.params;
	const filePath = path.join(__dirname, 'media', `${videoId}.mp4`);
  
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
  
app.get('/media/:videoId_chunk_:bandwidth_:segmentNumber.m4s', isAuthenticated, (req, res) => {

	console.log("IN /media/:videoId_chunk...");
	// if (!isAuthenticated) {
	// 	return res.status(200).json({ status: 'ERROR', error: true, message: "Must log in first"});
	// }

	// if (!(req.session && req.session.username)) {
	// 	return res.status(200).json({
	// 	  status: 'ERROR',
	// 	  error: true,
	// 	  message: 'Unauthorized access. Please log in first.',
	// 	});
	//   }
	
  
	const { videoId, bandwidth, segmentNumber } = req.params;
  	let fileName;

  	if (segmentNumber === 'init') {
    	fileName = `${videoId}_chunk_${bandwidth}_init.m4s`;
  	} else {
    	fileName = `${videoId}_chunk_${bandwidth}_${segmentNumber}.m4s`;
  	}

  	const filePath = path.join(__dirname, 'media', fileName);

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

app.get('/api/manifest/:id', isAuthenticated, (req, res) => {

	console.log("IN /api/manifest/:id with file", req.params.id);

	const videoId = req.params.id;
	const manifestPath = path.join(__dirname, 'media', `${videoId}_output.mpd`);
  
	fs.access(manifestPath, fs.constants.F_OK, (err) => {
	  if (err) {
		console.error('Manifest not found at:', manifestPath);
		return res.status(200).json({
		  status: 'ERROR',
		  error: true,
		  message: 'Manifest not found',
		});
	  } else {
		res.sendFile(manifestPath, (err) => {
		  if (err) {
			console.error('Error sending manifest:', err);
			if (!res.headersSent) {
			  res.status(200).json({
				status: 'ERROR',
				error: true,
				message: 'Error sending manifest',
			  });
			}
		  }
		});
	  }
	});
  });
  

  app.get('/play/:id', isAuthenticated, (req, res) => {
	// Authentication check
	// if (!(req.session && req.session.username)) {
	//   return res.status(200).json({
	// 	status: 'ERROR',
	// 	error: true,
	// 	message: 'Unauthorized access. Please log in first.',
	//   });
	// }
  
	const videoId = req.params.id;
	console.log("ID : ", videoId);
	res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'), { query: { id: videoId } });
});
  

app.get('/player', (req, res) => {
	if (!req.session.username) {
		return res.redirect('/login_page');
	}
	res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'));
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});