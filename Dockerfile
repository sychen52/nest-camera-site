FROM node:latest

WORKDIR /nest-camera-site
COPY . /nest-camera-site

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

RUN npm install

RUN mkdir /nest
VOLUME ["/nest"]

ENV PORT=5500
EXPOSE 5500/tcp
CMD ["npm", "run", "start"]
