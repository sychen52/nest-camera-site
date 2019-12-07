const {authGoogle} = require('nest-observe');
const {FileQueue} = require('./utils');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

CONFIG = JSON.parse(fs.readFileSync('./config.json'));
IMAGE_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

function capture() {
    authGoogle(CONFIG['issueToken'], CONFIG['cookie'], CONFIG['apikey']).then(token => {
        const fq = new FileQueue(20000, IMAGE_DIR)
        setInterval(() => {
            getImage(token.token, fq);
        }, 1000);
    });
}

function getImage(token, fq){
    fetch(`https://nexusapi-us1.camera.home.nest.com/get_image?uuid=${CONFIG['uuid']}&width=1920`, {
        method: 'GET',
        headers: {
            Origin: 'https://home.nest.com',
            Referer: 'https://home.nest.com/',
            Authorization: 'Basic ' + token,
            'accept': 'image/webp,image/apng,image/*,*/*;q=0.9',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36',
        },
    }).then(response => {
        const now = new Date();
        const filename = path.join(IMAGE_DIR,now.toJSON()+'.jpg');
        const file = fs.createWriteStream(filename);
        if (response.ok) {
            response.body.pipe(file);
            fq.push(filename);
        }
        else {
            console.log(response);
        }
    })
}

module.exports = {capture, IMAGE_DIR};
