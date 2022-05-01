const fs = require('fs');
const path = require('path');

class FileQueue {
    constructor(size, init_dir) {
        this.size = size;
        this.q = fs.readdirSync(init_dir);
        this.q = this.q.map(f => path.join(init_dir, f));
    }
    push(filename) {
        this.q.push(filename);
        while (this.q.length > this.size) {
            fs.unlink(this.q.shift(), err => {
                if (!!err) {
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
