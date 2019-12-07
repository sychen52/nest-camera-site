let img = document.getElementById("photo");
let p = document.getElementById("time");
let promise = null;

function render(offset) {
    if (!promise || offset === 0) {
        promise = fetch('/files')
        .then(res=>res.json())
        .then(json => {
            json.sort();
            return json;
        })
    }
    promise.then(files => {
        show(files[Math.round((files.length-1)*(1-offset))]);
    });
}

render(0);

function show(filename) {
    img.src = '/img/' + filename;
    time = new Date(filename.substr(0, filename.length-4));
    p.innerHTML = time.toString();
}
