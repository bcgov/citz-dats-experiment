ARG NODE_IMAGE_TAG
FROM node:${NODE_IMAGE_TAG}

RUN apt-get update && \
    apt-get install -y smbclient

WORKDIR /app

ENV NODE_ENV=development

EXPOSE ${BACKEND_PORT}

CMD ["npm", "run", "dev"]
