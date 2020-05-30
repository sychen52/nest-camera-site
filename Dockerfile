FROM node:latest

RUN git clone https://github.com/sychen52/nest-camera-site.git

WORKDIR /nest-camera-site
COPY config.json /nest-camera-site

RUN npm install \
 && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./selfsigned.key -out ./selfsigned.crt -subj "/C=US/ST=New Sweden/L=Stockholm/O=.../OU=.../CN=.../emailAddress=..."

RUN mkdir /nest
VOLUME ["/nest"]

ENV PORT=5500
EXPOSE 5500/tcp
CMD ["npm", "run", "start"]
