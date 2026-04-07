# nest-camera-site
Capture images from a shared nest camera stream and host in a local server.

## Configuration
This script now connects directly to a shared Nest camera stream. To configure it, you need to share your Nest camera with a password and gather the public token and password.

1. Go to your Nest app or web interface, share your Nest Camera, and protect it with a password.
2. Copy the public link which looks like `https://video.nest.com/live/YOUR_TOKEN`. `YOUR_TOKEN` is your `shared_token`.
3. The password you set is your `shared_password`.

Create a `config.json` in the root of the project with the following structure (an example is in `config.example.json`):

```json
{
    "shared_token": "YOUR_TOKEN",
    "shared_password": "your_password_here",
    "rotation_hours": 24,
    "interval_seconds": 0.9,
    "resolution_ratio": 1
}
```

## Install
**Requirement:** You must have `ffmpeg` installed on your host machine to stitch the captured images into video chunks. (e.g. `brew install ffmpeg` or `sudo apt-get install ffmpeg`).

After cloning the repo, change directory into the folder.
```
npm install
npm run start
```
Open a browser and go to the following url: http://[IP]:5500.

## Docker Install
Build image
```
docker build -t nest-camera-site:latest .
```

Start container:
```
docker run --name nest-camera-site -d -p 5500:5500 -v [/path/to/your/nest_folder]:/nest nest-camera-site:latest
```

Open a browser and go to the following url: http://[IP]:5500.

If you want to change credentials delete file `database.json` and rebuild the image.
```
docker build --no-cache -t nest-camera-site:latest .
```

## Acknowledgement
Thanks to Humpheh/nest-observe and dend/foggycam for the original ideas.
