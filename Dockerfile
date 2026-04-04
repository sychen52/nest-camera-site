FROM node:latest

RUN git clone https://github.com/sychen52/nest-camera-site.git

WORKDIR /nest-camera-site
COPY config.json /nest-camera-site

RUN npm install

RUN mkdir /nest
VOLUME ["/nest"]

ENV PORT=5500
EXPOSE 5500/tcp
CMD ["npm", "run", "start"]
