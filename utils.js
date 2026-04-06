const fs = require('fs');
const path = require('path');

class FileQueue {
    constructor(size, init_dir, ext = '.mp4') {
        this.size = size;
        let files = fs.readdirSync(init_dir).filter(f => f.endsWith(ext));
        files.sort();
        this.q = files.map(f => path.join(init_dir, f));
    }
    push(filename) {
        this.q.push(filename);
        while (this.q.length > this.size) {
            fs.unlink(this.q.shift(), err => {
                if (!!err && err.code !== 'ENOENT') {
                    console.log('unlink error:', err);
                }
            });
        }
    }
}


class Log {
    log(x) { console.log(x); }
    debug(x) { console.log(x); }
    error(x) { console.log(x); }
}
module.exports = {FileQueue, Log};
