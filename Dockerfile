FROM node:20.11.1 as builder
WORKDIR /code

COPY package.json package.json
RUN npm install

FROM node:20.11.1 as prod
WORKDIR /code
COPY --from=builder /code/node_modules ./node_modules

COPY . .
ENV TZ=America/La_Paz
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone