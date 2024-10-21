const express = require('express');
const app = express();
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');

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

app.use((req, res, next) => {
	res.setHeader('X-CSE356', '66d1c9697f77bf55c5004757');
	next();
});

app.use(express.static(path.join(__dirname, 'templates')));
//app.use('/media', express.static(path.join(__dirname, 'static', 'media')));


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

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});


// Authentication middleware
function isAuthenticated(req, res, next) {
	if (req.session && req.session.username) {
	  return next();
	} else {
	  return res.status(200).json({
		status: 'ERROR',
		error: true,
		message: 'Unauthorized access. Please log in first.',
	  });
	}
  }
  

  app.get('/', (req, res) => {
	if (req.session.username) {
	  // User is logged in, serve the media player directly
	  return res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'));
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
		const verificationLink = `http://130.245.136.207:5000/api/verify?${params}`;
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

	console.log('Received verification request:');
	console.log('Reqest:', req.query);
  	console.log('Email:', email);
  	console.log('Key:', key);
  
	if (!email || !key) {
		console.log('Missing email or key in the request');
		return res.status(200).json({ status: 'ERROR', error: true, message: 'Missing email or key in the request' });
	}
  
	try {
		const user = await User.findOne({ email, key });
	  	console.log(user);
	  	if (user) {
			user.verified = true;
			await user.save();
			console.log('Email verified successfully!');
			return res.status(200).json({ status: 'OK', message: 'Email verified successfully!' });
	  	} else {
			console.log('Invalid verification link');
			return res.status(200).json({ status: 'ERROR', error: true, message: 'Invalid verification link' });
	  	}
	} catch (e) {
		console.log('Error verifying user.');
		return res.status(200).json({ status: 'ERROR', error: true, message: e.message });
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

// Protected media routes with authentication middleware
app.get('/media/output.mpd', isAuthenticated, (req, res) => {
	const filePath = path.join(__dirname, 'static', 'media', 'output.mpd');
	res.sendFile(filePath);
  });
  
  app.get('/media/chunk_:bandwidth_:segmentNumber.m4s', isAuthenticated, (req, res) => {
	const { bandwidth, segmentNumber } = req.params;
	const fileName = `chunk_${bandwidth}_${segmentNumber}.m4s`;
	const filePath = path.join(__dirname, 'static', 'media', fileName);
  
	res.sendFile(filePath, (err) => {
	  if (err) {
		return res
		  .status(200)
		  .json({ status: 'ERROR', error: true, message: err.message });
	  }
	});
  });

app.get('/player', (req, res) => {
	if (!req.session.username) {
		return res.redirect('/login_page');
	}
	res.sendFile(path.join(__dirname, 'templates', 'mediaplayer.html'));
});