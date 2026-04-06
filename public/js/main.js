let player = document.getElementById("player");
let liveViewer = document.getElementById("live-viewer");
let timeline = document.getElementById("timeline");
let label = document.getElementById("timeline-label");
let marksContainer = document.getElementById("timeline-marks");

let videoFiles = [];
let currentPlayingIdx = -1;
let isScrubbing = false;
let isLive = false;
let liveInterval = null;
let serverTimeOffset = 0;

// 5 minutes in milliseconds
const CHUNK_DURATION_MS = 5 * 60 * 1000;

function getServerTime() {
    return Date.now() + serverTimeOffset;
}

function renderMarks(minMs, maxMs) {
    marksContainer.innerHTML = '';
    const durationMs = maxMs - minMs;
    if (durationMs <= 0) return;

    let intervalMs = 60 * 60 * 1000; // 1 hour
    if (durationMs > 12 * 60 * 60 * 1000) intervalMs = 2 * 60 * 60 * 1000;
    if (durationMs > 24 * 60 * 60 * 1000) intervalMs = 4 * 60 * 60 * 1000;
    if (durationMs < 2 * 60 * 60 * 1000) intervalMs = 15 * 60 * 1000;
    if (durationMs < 30 * 60 * 1000) intervalMs = 5 * 60 * 1000;

    let startMark = Math.ceil(minMs / intervalMs) * intervalMs;
    for (let t = startMark; t < maxMs; t += intervalMs) {
        const pct = ((t - minMs) / durationMs) * 100;
        const mark = document.createElement('div');
        mark.className = 'mark';
        mark.style.left = pct + '%';
        const d = new Date(t);
        const dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        const timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2, '0');
        mark.innerText = dateStr + ' ' + timeStr;
        marksContainer.appendChild(mark);
    }
}

function renderTrack(minMs, maxMs) {
    const durationMs = maxMs - minMs;
    if (durationMs <= 0 || videoFiles.length === 0) return;

    let gradientStops = [];
    let lastEndPct = 0;

    videoFiles.forEach(v => {
        let startPct = Math.max(0, ((v.startMs - minMs) / durationMs) * 100);
        let endPct = Math.min(100, ((v.endMs - minMs) / durationMs) * 100);

        if (startPct > lastEndPct) {
            gradientStops.push(`#444 ${lastEndPct}%`);
            gradientStops.push(`#444 ${startPct}%`);
        }

        gradientStops.push(`#007bff ${startPct}%`);
        gradientStops.push(`#007bff ${endPct}%`);

        lastEndPct = endPct;
    });

    if (lastEndPct < 100) {
        gradientStops.push(`#444 ${lastEndPct}%`);
        gradientStops.push(`#444 100%`);
    }

    timeline.style.background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
}

function loadVideos() {
    fetch('/videos').then(res => {
        const serverDate = res.headers.get('Date');
        if (serverDate) {
            serverTimeOffset = new Date(serverDate).getTime() - Date.now();
        }
        return res.json();
    }).then(files => {
        if (files.length === 0) {
            label.innerText = "LIVE - No videos recorded yet.";
            timeline.min = getServerTime() - 60000;
            timeline.max = getServerTime();
            goLive();
            return;
        }

        let newVideoFiles = [];
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const startMs = new Date(f.replace('.mp4', '')).getTime();
            // Estimate duration exactly as CHUNK_DURATION_MS to expose gaps
            const endMs = startMs + CHUNK_DURATION_MS;
            newVideoFiles.push({ filename: f, startMs, endMs });
        }

        videoFiles = newVideoFiles;

        const minTime = videoFiles[0].startMs;
        const maxTime = getServerTime();

        if (!isScrubbing) {
            timeline.min = minTime;
            timeline.max = maxTime;
            renderMarks(minTime, maxTime);
            renderTrack(minTime, maxTime);

            if (currentPlayingIdx === -1 && !isLive) {
                goLive();
            }
        }
    });
}

function goLive() {
    if (!isLive) {
        isLive = true;
        currentPlayingIdx = -1;
        player.style.display = 'none';
        player.pause();
        liveViewer.style.display = 'block';

        liveInterval = setInterval(() => {
            if (!isScrubbing) {
                const now = getServerTime();
                const minTime = videoFiles.length > 0 ? videoFiles[0].startMs : now - 60000;
                timeline.max = now;
                timeline.value = now;
                renderTrack(minTime, now);
                updateLabel(now, true);
            }
            liveViewer.src = '/latest_image?t=' + Date.now();
        }, 1500);

        const now = getServerTime();
        timeline.max = now;
        timeline.value = now;
        updateLabel(now, true);
        liveViewer.src = '/latest_image?t=' + Date.now();
    }
}

function playTime(timeMs) {
    if (videoFiles.length === 0) return;

    const maxVideoTime = videoFiles[videoFiles.length - 1].endMs;

    if (timeMs >= maxVideoTime - 5000) {
        goLive();
        return;
    }

    if (isLive) {
        isLive = false;
        clearInterval(liveInterval);
        liveInterval = null;
        liveViewer.style.display = 'none';
        player.style.display = 'block';
    }

    const minTime = videoFiles[0].startMs;
    if (timeMs < minTime) timeMs = minTime;

    let idx = videoFiles.findIndex(v => timeMs >= v.startMs && timeMs < v.endMs);

    if (idx === -1) {
        // We clicked on a gap. Find the next available chunk.
        idx = videoFiles.findIndex(v => v.startMs > timeMs);
        if (idx === -1) {
            idx = videoFiles.length - 1;
        } else {
            // Jump timeline to the start of the next valid chunk
            timeMs = videoFiles[idx].startMs;
            timeline.value = timeMs;
        }
    }

    const offsetSec = (timeMs - videoFiles[idx].startMs) / 1000;

    if (currentPlayingIdx !== idx) {
        currentPlayingIdx = idx;
        player.src = '/video/' + videoFiles[idx].filename;

        player.onloadedmetadata = () => {
            player.currentTime = offsetSec;
            player.play().catch(e => console.log('Autoplay prevented:', e));
            player.onloadedmetadata = null;
        };
    } else {
        player.currentTime = offsetSec;
        if (player.paused) player.play().catch(e => console.log(e));
    }
}

function updateLabel(timeMs, isLiveText = false) {
    const d = new Date(timeMs);
    label.innerText = (isLiveText ? "LIVE - " : "") + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

timeline.addEventListener('input', () => {
    isScrubbing = true;
    const timeMs = parseInt(timeline.value);
    const maxVideoTime = videoFiles.length > 0 ? videoFiles[videoFiles.length - 1].endMs : getServerTime();
    updateLabel(timeMs, timeMs >= maxVideoTime - 5000);
});

timeline.addEventListener('change', () => {
    isScrubbing = false;
    const timeMs = parseInt(timeline.value);
    playTime(timeMs);
});

player.addEventListener('timeupdate', () => {
    if (currentPlayingIdx !== -1 && !isScrubbing && !isLive) {
        const v = videoFiles[currentPlayingIdx];
        const currentTimeMs = v.startMs + (player.currentTime * 1000);

        if (currentTimeMs <= parseInt(timeline.max)) {
            timeline.value = currentTimeMs;
            updateLabel(currentTimeMs, false);
        }
    }
});

player.addEventListener('ended', () => {
    if (currentPlayingIdx < videoFiles.length - 1) {
        currentPlayingIdx++;
        const nextChunkMs = videoFiles[currentPlayingIdx].startMs;
        timeline.value = nextChunkMs;
        updateLabel(nextChunkMs, false);
        player.src = '/video/' + videoFiles[currentPlayingIdx].filename;
        player.play().catch(e => console.log(e));
    } else {
        goLive();
    }
});

loadVideos();
setInterval(() => loadVideos(), 60000);
