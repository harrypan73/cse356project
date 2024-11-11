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

const PORT = 80;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + '-' + file.originalname;
        cb(null, filename);
    }
});

// Initialize multer with the storage configuration
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log("Uploaded field:", file.fieldname); // Log field name
        if (file.mimetype !== 'video/mp4') {
            return cb(new Error('Only MP4 videos are allowed'), false);
        }
        cb(null, true);
    },
    fields: [{name: 'mp4File', maxCount: 1}]
}).single('mp4File'); // Ensure 'mp4file' matches the client-side field

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
app.use('/testing', express.static(path.join(__dirname, 'testing')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
// Serve static files from the 'templates' directory
app.use('/templates', express.static(path.join(__dirname, 'templates')));
//app.use('/processed_videos', express.static(path.join(__dirname, 'processed_videos')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

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
    } else {
        // User is not logged in, serve the login page
        return res.sendFile(path.join(__dirname, 'templates', 'login.html'));
    }
});


app.get('/register', (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'adduser.html'));
});

app.get('/login_page', (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'login.html'));
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

		const user = new User({ username, password, email, verified: false, key });
		await user.save();

		const params = `email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`;
		console.log('Parameters:', params);
		//const encodedParams = new URLSearchParams(params).toString();
		const verificationLink = `http://130.245.136.205/api/verify?${params}`;
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
  
    console.log("Received id:", id);
  
    // Parse 'value' to appropriate type
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null' || value === '') value = null;
  
    if (!id || typeof value === 'undefined') {
      return res.status(200).json({
        status: "ERROR",
        error: true,
        message: "LIKE FUNCTION MISSING PARAMETERS"
      });
    }

    console.log(id);
  
    try {
        let video = await Video.findOne({ id: `${id}` })

        console.log(video.likes);

        // Check for existing like by the user
        const userLike = video.likes.find(like => like.userId === req.session.username);

        if (userLike && userLike.value === value) {
            // Same value as existing
            return res.status(200).json({
                status: "ERROR",
                error: true,
                message: "NO CHANGE IN LIKE/DISLIKE"
            });
        }

        if (userLike) {
            if (value === null) {
                // Remove the like/dislike
                video.likes = video.likes.filter(like => like.userId !== req.session.username);
            } else {
                // Update the value
                userLike.value = value;
            }
        } else {
            if (value !== null) {
                // Add new like/dislike
                video.likes.push({
                    userId: req.session.username,
                    value: value
                });
            }
            // If value is null and there's no existing like/dislike, do nothing
        }

        await video.save();

        const likesCount = video.likes.filter(like => like.value === true).length;

        return res.status(200).json({
            status: "OK",
            likes: likesCount
        });

    } catch (e) {
        console.error("Error liking/disliking: ", e);
        return res.status(200).json({
            status: "ERROR",
            error: true,
            message: e.message
        });
    }
});



app.get('/api/like_state/:id', isAuthenticated, async (req, res) => {
    const videoId = req.params.id;
  
    try {
      let video = await Video.findOne({ id: `${videoId}` })
  
      if (!video) {
        video = await Video.findById(videoId);
  
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


app.post('/api/videos', isAuthenticated, async (req, res) => {
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
    // try {
    //   const count = parseInt(req.body.count) || 5;
    //   const offset = parseInt(req.body.offset) || 0;
    //   const excludeIds = req.body.excludeIds || [];
  
    //   const videosQuery = Video.find();
  
    //   if (excludeIds.length > 0) {
    //     videosQuery.where('id').nin(excludeIds).where('_id').nin(excludeIds);
    //   }
  
    //   const videos = await videosQuery.skip(offset).limit(count).exec();
  
    //   // Ensure that 'id' is always present
    //   const videoList = videos.map(video => ({
    //     id: video.id || video._id.toString(),
    //   }));
  
    //   res.status(200).json({ status: "OK", videos: videoList });
    // } catch (error) {
    //   console.error("Error fetching videos:", error);
    //   res.status(200).json({ status: "ERROR", message: error.message });
    // }
});
  



app.post('/api/upload', upload, isAuthenticated, async (req, res) => {
    const author = req.session.username;
	const { title } = req.body;
	const mp4File = req.file;

	if (!author || !title || !mp4File) {
		return res.status(200).json({
			status: "ERROR", 
			error: true,
			message: "UPLOAD FUNCTION MISSING PARAMETERS"
		})
	}

	try {
		const fileName = path.basename(mp4File.path, ".mp4");
		console.log('Uploaded file:', mp4File);
		console.log('File name:', fileName);
		
		// const videoPath = path.join(__dirname, "videos", `${fileName}.mp4`);
		const videoPath = mp4File.path;
		// fs.writeFileSync(videoPath, mp4File.data);

		const video = new Video({
			id: title + author + Date.now(),
			author: author,
			title: title,
			likes: [],
			views: [],
			processingStatus: "processing"
		});

		await video.save();

		// Create chunks and manifest
        const outputFile = path.join(__dirname, 'media', `${video.id}.mpd`);
        
        // Ensure the media directory exists
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });

        const ffmpegCommand = [
            'ffmpeg', '-i', videoPath,
            '-map', '0:v', '-b:v:0', '254k', '-s:v:0', '320x180', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:1', '507k', '-s:v:1', '320x180', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:2', '759k', '-s:v:2', '480x270', '-vf', 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:3', '1013k', '-s:v:3', '640x360', '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:4', '1254k', '-s:v:4', '640x360', '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:5', '1883k', '-s:v:5', '768x432', '-vf', 'scale=768:432:force_original_aspect_ratio=decrease,pad=768:432:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:6', '3134k', '-s:v:6', '1024x576', '-vf', 'scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-b:v:7', '4952k', '-s:v:7', '1280x720', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
            '-use_template', '1', '-use_timeline', '1', '-seg_duration', '10',
            '-init_seg_name', `media/${fileName}_init_\$RepresentationID\$.m4s`,
            '-media_seg_name', `media/${fileName}_chunk_\$Bandwidth\$_\$Number\$.m4s`,
            '-adaptation_sets', 'id=0,streams=v',
            '-f', 'dash', outputFile
          ];
        // const ffmpegPath = await exec('which ffmpeg');
        // console.log('FFmpeg Path:', ffmpegPath);
                      
        // Run FFmpeg command in the background without waiting for it to finish
        console.log(`Processing video in background: ${fileName}`);
        const ffmpegProcess = subprocess.spawn(ffmpegCommand[0], ffmpegCommand.slice(1));

        // Capture stderr and stdout to log errors
        ffmpegProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg Error: ${data.toString()}`);
        });
        ffmpegProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg Output: ${data.toString()}`);
        });

        // Listen for FFmpeg's completion
        ffmpegProcess.on('exit', async (code, signal) => {
            if (code === 0) {
                console.log(`Successfully processed video: ${fileName}`);
                // Update the processing status of the video to "completed"
                video.processingStatus = "complete";
                await video.save();
            } else {
                console.error(`Error processing video ${fileName}. Exit code: ${code}, Signal: ${signal}`);
                // Optionally, you can handle the error by updating the status to "failed"
                // video.processingStatus = "failed";
                // await video.save();
            }
        });

		return res.status(200).json({
            status: "OK",
            error: false,
			id: video.id
		})

	} catch (e) {
		console.error("Error uploading video: ", e);
		return res.status(200).json({
			status: "ERROR",
			error: true,
			message: e.message
		})
	}
})

app.post('/api/view', isAuthenticated, async (req, res) => {
	const { id } = req.body;

	// IMPLEMENT
	if (!id) {
		return res.status(200).json({
			status: "ERROR",
			error: true,
			message: "VIEW FUNCTION MISSING PARAMETERS"
		})
	}

	try {
		
		let video = await Video.findOne({ id: `${id}` })

		if (!video) {
			return res.status(200).json({
				status: "ERROR", 
				error: true,
				message: "VIDEO NOT FOUND"
			})
		}

		// Check for existing view by the user
		const userView = video.views.find(view => view.userId === req.session.username);

		if (userView) {
			return res.status(200).json({
                status: "OK",
				viewed: true
			})
		} else {
			
			// Add view before returning false
			video.views.push({
				userId: req.session.username
			})

			await video.save();

			return res.status(200).json({
                status: "OK",
				viewed: false
			})
		}

	} catch (e) {
		console.error("Error processing view: ", e);
		res.status(200).json({
			status: "ERROR",
			error: true,
			message: e.message
		})
	}

})

app.get('/upload', isAuthenticated, async (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'upload.html'));
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

const videosDir = path.join(__dirname, 'videos');

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
// 	const videoPath = path.join(__dirname, "videos", `${videoId}.mp4`);
//     const thumbnailPath = path.join(__dirname, "thumbnails", `${videoId}.jpg`);
		
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
    console.log("SEARCHING THUMBNAILS");
    const thumbnailPath = path.join(__dirname, "thumbnails", `${videoId}_thumbnail.jpg`);
    
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

        const files = fs.readdirSync(videosDir);
        const videoFiles = files.filter(file => path.extname(file).toLowerCase() === '.mp4');

        const startIndex = page * count;
        const selectedVideoFiles = videoFiles.slice(startIndex, startIndex + count);

        const videos = selectedVideoFiles.map(file => {
            const title = path.basename(file, '.mp4');
            return {
                id: title,
                thumbnail: `api/thumbnail/${title}`,
                description: `Description for ${title}`
            };
        });

        res.status(200).json({ status: "OK", videos });
    } catch (error) {
        console.error("Error fetching videos:", error);
        res.status(200).json({ status: "ERROR", message: error.message });
    }
});
app.get('/media/:filename', isAuthenticated, (req, res) => {
  
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
  
  app.get('/media/chunks/:videoId_chunk_:bandwidth_:segmentNumber.m4s', isAuthenticated, (req, res) => {
    const { videoId, bandwidth, segmentNumber } = req.params;
    let fileName;

    if (segmentNumber === 'init') {
        fileName = `${videoId}_chunk_${bandwidth}_init.m4s`;
    } else {
        fileName = `${videoId}_chunk_${bandwidth}_${segmentNumber}.m4s`;
    }

    const filePath = path.join(__dirname, 'media', fileName);

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
    const manifestPath = path.join(__dirname, 'media', `${videoId}.mpd`);

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

  

app.get('/play/:id', isAuthenticated, (req, res) => {
	const videoId = req.params.id;
	console.log("ID : ", videoId);
    // Path to the static HTML template
    const templatePath = path.join(__dirname, 'templates', 'mediaplayer.html');
        
    // Read the HTML file
    fs.readFile(templatePath, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Server error');
        }

        // Replace the placeholder with the actual videoId
        const htmlContent = data.replace('{{videoId}}', videoId);

        // Send the modified HTML with the embedded videoId
        res.send(htmlContent);
});
});
  

app.get('/player', (req, res) => {
	if (!req.session.username) {
		return res.redirect('/login_page');
	}
	res.sendFile(path.join(__dirname, 'templates', 'videos.html'));
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});