const express = require('express');
const https = require('https')
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto')
const {capture, IMAGE_DIR} = require('./capture');

const database = './database.json';
if (!fs.existsSync(database)) {
    const readlineSync = require('readline-sync');
    const username = readlineSync.question('username: ');
    const password = readlineSync.questionNewPassword('password: ', {min: 6});
    const hash = bcrypt.hashSync(password, 10);
    fs.writeFileSync(database, JSON.stringify({'username': username, 'hash': hash}));
}

const user = JSON.parse(fs.readFileSync(database, "utf8"));

const app = express();

app.use(session({
    secret: crypto.randomBytes(64).toString('hex'),
    resave: true,
    saveUninitialized: true
}));

app.use(bodyParser.urlencoded({extended: true}));
app.post('/login', function (req, res) {
    if(req.body.username === user.username) {
        console.log('verify password.', 'hash type:', typeof(user.hash), '; hash length:', user.hash.length);
        bcrypt.compare(req.body.password, user.hash, (err, result) => {
            if (result && !err) {
                console.log('passed');
                req.session.user = user.username;
                req.session.admin = true;
                res.redirect('/');
            }
            else {
                console.log('failed', err);
                res.redirect('/login.html');
            }
        });
    }
    else {
        res.redirect('/login.html');
    }
});

// Logout endpoint
app.get('/logout', function (req, res) {
    req.session.destroy();
    res.send('logout success!');
});


// Authentication and Authorization Middleware
app.use((req, res, next) => {
    if (req.session && req.session.user === user.username && req.session.admin)
        return next();
    else
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/files', (req, res) => {
    let files = fs.readdirSync(IMAGE_DIR);
    files.sort();
    res.json(files);
});

app.get('/img/:filename', (req, res) => {
    res.sendFile(path.join(IMAGE_DIR, req.params.filename));
});

const PORT = process.env.PORT || 5000;

let sslOptions = {
    key: fs.readFileSync('selfsigned.key', 'utf8'),
    cert: fs.readFileSync('selfsigned.crt', 'utf8')
  };

https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    capture();
});
