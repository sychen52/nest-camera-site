const {FileQueue, Log} = require('./utils');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'nest');

if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

function capture() {
    fs.readFile('./config.json', (err, data) => {
        if (err) {
            console.error('Could not read config.json:', err.message);
            return;
        }
        const config = JSON.parse(data);
        const fq = new FileQueue(config['rotation_hours']*3600/config['interval_seconds'], IMAGE_DIR);
        connect(config, fq);
    });
}

async function connect(config, fq) {
    const log = new Log();
    log.log('Authenticating with Nest shared stream...');
    try {
        const loginRes = await fetch('https://video.nest.com/api/dropcam/share.login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Origin': 'https://video.nest.com',
                'Referer': `https://video.nest.com/live/${config.shared_token}`,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: `token=${config.shared_token}&password=${encodeURIComponent(config.shared_password)}`
        });

        if (!loginRes.ok) {
            throw new Error(`Login failed with HTTP status ${loginRes.status}`);
        }

        const loginData = await loginRes.json();
        if (loginData.status !== 0) {
             throw new Error(`Login rejected by Nest API: ${loginData.status_detail || loginData.status_description}`);
        }

        const cookies = loginRes.headers.raw()['set-cookie'];
        const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

        const infoRes = await fetch(`https://video.nest.com/api/dropcam/cameras.get_by_public_token?token=${config.shared_token}`, {
            headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });

        if (!infoRes.ok) {
            throw new Error(`Failed to get camera info, status ${infoRes.status}`);
        }

        const infoData = await infoRes.json();
        if (!infoData.items || infoData.items.length === 0) {
            throw new Error('No cameras found for this token.');
        }

        const camera = infoData.items[0];
        const uuid = camera.uuid;
        const host = camera.nexus_api_nest_domain_host;

        // Dynamically probe the camera's max supported width
        let nativeWidth = 1920; // safe fallback
        const widthsToTry = [3840, 2560, 1920, 1600, 1280];
        for (let w of widthsToTry) {
            const probeUrl = `https://${host}/get_image?uuid=${uuid}&width=${w}`;
            try {
                const probeRes = await fetch(probeUrl, { method: 'GET', headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }});
                if (probeRes.ok) {
                    nativeWidth = w;
                    break;
                }
            } catch (e) {} // ignore probe failures
        }

        log.log(`Connected successfully. Camera UUID: ${uuid}, Host: ${host}, Max Native Width Found: ${nativeWidth}`);

        const session = { uuid, host, cookieStr, nativeWidth };

        setTimeout(() => getImage(config, session, fq), config['interval_seconds']*1000);

    } catch (err) {
        log.error('Caught an error in connect: ' + err.message);
        setTimeout(() => connect(config, fq), 10000); // Retry connection after 10s
    }
}

async function getImage(config, session, fq) {
    const now = new Date();
    const { uuid, host, cookieStr } = session;

    // Default to 1920 base width. If resolution_ratio is provided, scale it.
    const reqWidth = config.resolution_ratio ? Math.round(1920 * config.resolution_ratio) : (config.resolution || 1920);
    const url = `https://${host}/get_image?uuid=${uuid}&width=${reqWidth}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cookie': cookieStr,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            },
            timeout: 5000
        });

        if (response.ok) {
            const filename = path.join(IMAGE_DIR, now.toJSON()+'.jpg');
            const file = fs.createWriteStream(filename);
            response.body.pipe(file);
            fq.push(filename);

            setTimeout(() => getImage(config, session, fq), config['interval_seconds']*1000);
        } else {
            console.log(now, response.status, 'failed to fetch image');
            if (response.status === 401 || response.status === 403) {
                console.log('Session expired or unauthorized, reconnecting...');
                connect(config, fq);
            } else {
                setTimeout(() => getImage(config, session, fq), config['interval_seconds']*1000);
            }
        }
    } catch (error) {
        console.log(now, "fetch error caught:", error.message);
        setTimeout(() => getImage(config, session, fq), config['interval_seconds']*1000);
    }
}

module.exports = {capture, IMAGE_DIR};
