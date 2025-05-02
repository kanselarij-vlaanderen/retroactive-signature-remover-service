FROM semtech/mu-javascript-template:latest
LABEL maintainer="Sergio Fenoll <sergio@fenoll.be>"

ENV ALLOW_MU_AUTH_SUDO=true
ENV NODE_OPTIONS="--max-old-space-size=4096"