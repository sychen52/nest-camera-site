const {authGoogle} = require('nest-observe');
const {FileQueue} = require('./utils');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

IMAGE_DIR = path.join(__dirname, '..', 'nest');
const config = JSON.parse(fs.readFileSync('./config.json'));
const fq = new FileQueue(config['rotation_hours']*3600/config['interval_seconds'], IMAGE_DIR)

if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

function capture() {
    authGoogle(config['issueToken'], config['cookie'], config['apikey']).then(token => {
        setTimeout(() => getImage(token), config['interval_seconds']*1000);
    });
}

function getImage(token){
    const now = new Date();
    if (now < token.expiry) {
        setTimeout(() => getImage(token), config['interval_seconds']*1000);
    }
    else {
        setTimeout(capture, config['interval_seconds']*1000);
    }

    fetch(`https://nexusapi-us1.camera.home.nest.com/get_image?uuid=${config['uuid']}&width=1920`, {
        method: 'GET',
        headers: {
            Origin: 'https://home.nest.com',
            Referer: 'https://home.nest.com/',
            Authorization: 'Basic ' + token.token,
            'accept': 'image/webp,image/apng,image/*,*/*;q=0.9',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36',
        },
    }).then(response => {
        if (response.ok) {
            const filename = path.join(IMAGE_DIR,now.toJSON()+'.jpg');
            const file = fs.createWriteStream(filename);
            response.body.pipe(file);
            fq.push(filename);
        }
        else {
            console.log(now);
            console.log(response);
        }
    })
}

module.exports = {capture, IMAGE_DIR};
