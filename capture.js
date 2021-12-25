const {FileQueue, Log} = require('./utils');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const NestConnection = require('homebridge-nest/lib/nest-connection.js');



IMAGE_DIR = path.join(__dirname, '..', 'nest');

if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

function capture() {
    fs.readFile('./config.json', (err, data) => { 
        const config = JSON.parse(data);
        const fq = new FileQueue(config['rotation_hours']*3600/config['interval_seconds'], IMAGE_DIR);
        connect(config, fq);
    });
}

function connect(config, fq) {
    const log = new Log();
    const conn = new NestConnection(config.platforms[0], log, false, false);
    conn.auth().then(connected => {
        if (!connected) {
            console.log('Unable to connect to Nest service.');
	}
        setTimeout(() => getImage(config, fq), config['interval_seconds']*1000);
    })
    .catch((err) => {
        console.log('Caught an error in connect.', err);
        setTimeout(() => getImage(config, fq), config['interval_seconds']*1000);
    });
}

function getImage(config, fq){
    const now = new Date();
    fetch(`https://nexusapi-${config['server']}.camera.home.nest.com/get_image?uuid=${config['uuid']}&width=${config['resolution']}`, {
        method: 'GET',
        headers: {
            Origin: 'https://home.nest.com',
            Referer: 'https://home.nest.com/',
            Authorization: 'Basic ' + config.platforms[0].access_token,
            'accept': 'image/webp,image/apng,image/*,*/*;q=0.9',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36',
        },
    }).then(response => {
        if (response.ok) {
            setTimeout(() => getImage(config, fq), config['interval_seconds']*1000);
            const filename = path.join(IMAGE_DIR,now.toJSON()+'.jpg');
            const file = fs.createWriteStream(filename);
            response.body.pipe(file);
            fq.push(filename);
        }
        else {
            console.log(now, response.status);
            if (response.status != 404) {
                console.log(response);
                console.log(response.headers);
                response.text().then(data => {console.log(data);});
                connect(config, fq)
            }
            else {
                setTimeout(() => getImage(config, fq), config['interval_seconds']*1000);
            }
        }
    }).catch(error => {
        console.log(now, "fetch error caught:", error);
        connect(config, fq);
    });
}
module.exports = {capture, IMAGE_DIR};
