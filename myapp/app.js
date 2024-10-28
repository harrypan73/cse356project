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

// Logging middleware
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
	console.log(`Headers:`, req.headers);
	console.log(`Body:`, req.body);
	console.log(`Session:`, req.session);
	next();
  });
  
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

app.use((req, res, next) => {
	res.setHeader('X-CSE356', '66d1c9697f77bf55c5004757');
	next();
});

app.use(express.static(path.join(__dirname, 'templates')));
//app.use('/media', express.static(path.join(__dirname, 'static', 'media')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/processed_videos', express.static(path.join(__dirname, 'processed_videos')));


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
		res.status(401).send('Unauthorized');
	  } else {
		res.status(200).json({
		  status: 'ERROR',
		  error: true,
		  message: 'Unauthorized access. Please log in first.',
		});
	  }
	}
  }
  
  

app.get('/', (req, res) => {
if (req.session.username) {
	// User is logged in, serve the media player directly
	return res.sendFile(path.join(__dirname, 'templates', 'videos.html'));
	// return res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'));
} else {
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

app.post('/api/videos/:count', async (req, res) => {
	const count = parseInt(req.params.count, 10);

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

			return { title: title, description: description };
		});

		const selectedVideos = videos.slice(start, start + count);

		return res.status(200).json({ status: 'OK', videos: selectedVideos });
	} catch(e) {
		return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
	}
});

const generateThumbnail = (videoPath, thumbnailPath) => {
	return new Promise((resolve, reject) => {
		ffmpeg(videoPath).on('end', () => {
			resolve(thumbnailPath);
		}).on('error', (e) => {
			console.log("Error generating thumbnail", e);
			reject(e);
		}).screenshots({
			count: 1,
			folder: path.dirname(thumbnailPath),
			filename: path.basename(thumbnailPath),
			size: '320x240',
			timemarks: ['0']
		})
	})
}

app.get('/api/thumbnail/:id', async (req, res) => {
	const videoId = req.params.id;
	const videoPath = path.join(__dirname, "videos", `${videoId}.mp4`);
	const thumbnailPath = path.join(__dirname, "thumbnails", `${videoId}.jpg`);
	try {
		await generateThumbnail(videoPath, thumbnailPath);
		res.sendFile(thumbnailPath);
	} catch (e) {
		console.error(e);
		res.status(200).json({status: "ERROR", error: true, "message": e.message})
	}
})

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
	}
})

// Protected media routes with authentication middleware
app.get('/media/output.mpd', isAuthenticated, (req, res) => {
	const filePath = path.join(__dirname, 'static', 'media', 'output.mpd');
	res.sendFile(filePath);
  });


  app.get('/media/:videoId/:segment', isAuthenticated, (req, res) => {
	const { videoId, segment } = req.params;
	const filePath = path.join(__dirname, 'processed_videos', videoId, segment);
  
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
  
app.get('/media/chunk_:bandwidth_:segmentNumber.m4s', isAuthenticated, (req, res) => {
  const { bandwidth, segmentNumber } = req.params;
  let fileName;

  if (segmentNumber === 'init') {
    fileName = `chunk_${bandwidth}_init.m4s`;
  } else {
    fileName = `chunk_${bandwidth}_${segmentNumber}.m4s`;
  }

  const filePath = path.join(__dirname, 'static', 'media', fileName);

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
    const videoId = req.params.id;
    const manifestPath = path.join(__dirname, 'processed_videos', videoId, 'manifest.mpd');

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
    const videoId = req.params.id;
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
