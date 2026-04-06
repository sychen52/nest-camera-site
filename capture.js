const {FileQueue, Log} = require('./utils');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const IMAGE_DIR = path.join(__dirname, '..', 'nest');
const STITCH_INTERVAL_MINUTES = 5;

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
        const maxVideos = config['rotation_hours'] * (60 / STITCH_INTERVAL_MINUTES);
        const fq = new FileQueue(maxVideos, IMAGE_DIR, '.mp4');

        connect(config);

        // Run stitcher periodically
        setInterval(() => stitchImages(config, fq), STITCH_INTERVAL_MINUTES * 60 * 1000);

        // Run cleanup periodically (every hour)
        setInterval(() => cleanOldFiles(config), 60 * 60 * 1000);

        // Also run once shortly after startup if there are orphaned images
        setTimeout(() => stitchImages(config, fq), 60 * 1000);
        setTimeout(() => cleanOldFiles(config), 60 * 1000);
    });
}

function cleanOldFiles(config) {
    const log = new Log();
    try {
        if (!config.rotation_hours) return;
        const maxAgeMs = config.rotation_hours * 60 * 60 * 1000;
        const now = Date.now();
        const files = fs.readdirSync(IMAGE_DIR);

        let deletedCount = 0;
        for (let f of files) {
            const filePath = path.join(IMAGE_DIR, f);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            log.log(`Cleaned up ${deletedCount} old files (older than ${config.rotation_hours} hours).`);
        }
    } catch (e) {
        log.error('Error cleaning old files: ' + e.message);
    }
}

async function connect(config) {
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

        const session = { uuid, host, cookieStr, nativeWidth, inflight: 0, stopped: false };

        session.captureInterval = setInterval(() => getImage(config, session), config['interval_seconds'] * 1000);

    } catch (err) {
        log.error('Caught an error in connect: ' + err.message);
        setTimeout(() => connect(config), 10000); // Retry connection after 10s
    }
}

async function getImage(config, session) {
    if (session.stopped) return;
    if (session.inflight > 10) {
        console.log('Skipping frame, network backlogged...');
        return;
    }

    session.inflight++;
    const now = new Date();
    const { uuid, host, cookieStr, nativeWidth } = session;

    // Scale the native width using the configured resolution_ratio
    const reqWidth = config.resolution_ratio ? Math.round(nativeWidth * config.resolution_ratio) : nativeWidth;
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
            const buffer = await response.buffer();
            const filename = path.join(IMAGE_DIR, now.toJSON()+'.jpg');
            fs.writeFile(filename, buffer, () => {});
        } else {
            console.log(now, response.status, 'failed to fetch image');
            if (response.status === 401 || response.status === 403) {
                console.log('Session expired or unauthorized, reconnecting...');
                if (!session.stopped) {
                    session.stopped = true;
                    clearInterval(session.captureInterval);
                    connect(config);
                }
            }
        }
    } catch (error) {
        console.log(now, "fetch error caught:", error.message);
    } finally {
        session.inflight--;
    }
}

let isStitching = false;

async function stitchImages(config, fq) {
    if (isStitching) return;
    isStitching = true;
    const log = new Log();
    try {
        let allFiles = fs.readdirSync(IMAGE_DIR).filter(f => f.endsWith('.jpg')).sort();
        if (allFiles.length <= 1) return;

        while (allFiles.length > 1) {
            const firstTime = new Date(allFiles[0].replace('.jpg', '')).getTime();
            let sliceIdx = 1;
            
            // Find how many files fit into this 5-minute window
            while (sliceIdx < allFiles.length - 1) {
                const currentTime = new Date(allFiles[sliceIdx].replace('.jpg', '')).getTime();
                if (currentTime - firstTime >= STITCH_INTERVAL_MINUTES * 60 * 1000) {
                    break;
                }
                sliceIdx++;
            }

            // If we haven't reached a 5-minute span and we're at the end of the available files 
            // (minus the last one being written), we wait for the next interval.
            const lastTimeInSlice = new Date(allFiles[sliceIdx].replace('.jpg', '')).getTime();
            if (sliceIdx === allFiles.length - 1 && lastTimeInSlice - firstTime < STITCH_INTERVAL_MINUTES * 60 * 1000) {
                break;
            }

            let filesToStitch = allFiles.slice(0, sliceIdx);
            allFiles = allFiles.slice(sliceIdx);

            if (filesToStitch.length === 0) break;

            const firstFile = filesToStitch[0];
            const videoName = firstFile.replace('.jpg', '.mp4');
            const videoPath = path.join(IMAGE_DIR, videoName);
            const listPath = path.join(IMAGE_DIR, `list_${Date.now()}.txt`);

            // Create ffmpeg concat list with exact calculated durations per frame
            let listContent = '';
            for (let i = 0; i < filesToStitch.length; i++) {
                listContent += `file '${path.join(IMAGE_DIR, filesToStitch[i])}'\n`;
                if (i < filesToStitch.length - 1) {
                    const t1 = new Date(filesToStitch[i].replace('.jpg', '')).getTime();
                    const t2 = new Date(filesToStitch[i+1].replace('.jpg', '')).getTime();
                    let durSec = (t2 - t1) / 1000;
                    // Cap max duration between frames to 60 seconds so huge gaps don't crash playback
                    if (durSec > 60) durSec = 60; 
                    listContent += `duration ${durSec.toFixed(3)}\n`;
                } else {
                    // Last frame gets the nominal configured interval as its duration
                    listContent += `duration ${config.interval_seconds || 1.5}\n`;
                    listContent += `file '${path.join(IMAGE_DIR, filesToStitch[i])}'\n`; // ffmpeg concat demuxer quirk
                }
            }
            
            fs.writeFileSync(listPath, listContent);
            
            log.log(`Stitching ${filesToStitch.length} images spanning ${((lastTimeInSlice - firstTime)/1000/60).toFixed(1)} mins into ${videoName}...`);
            
            // Generate variable framerate video (-vsync vfr)
            await execPromise(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -vsync vfr -c:v libx264 -pix_fmt yuv420p "${videoPath}"`);

            fq.push(videoPath);

            // Cleanup
            fs.unlinkSync(listPath);
            for (let f of filesToStitch) {
                try { fs.unlinkSync(path.join(IMAGE_DIR, f)); } catch(e){}
            }
            log.log(`Stitching complete: ${videoName}`);
        }
    } catch (e) {
        log.error('Error during stitching: ' + e.message);
    } finally {
        isStitching = false;
    }
}
module.exports = {capture, IMAGE_DIR};
