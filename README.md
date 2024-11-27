![CI](https://dev.sp-tarkov.com/medusa/spt-server/actions/workflows/run-test.yml/badge.svg)

# Docker Supported

docker hub: https://hub.docker.com/r/stblog/spt-server

ghcr.io: https://github.com/AirryCo/spt-server-ci/pkgs/container/spt-server

1. workingdir: `/opt/spt-server`
2. port: `6969` tcp default
3. volume:
   - `/opt/spt-server`

## How to run

### 3.10 and later

```bash
docker pull stblog/spt-server:nightly
docker run -d --name spt-server -v ./spt-server:/opt/spt-server -e backendIp=192.168.1.1 -e backendPort=6969 -p 6969:6969 stblog/spt-server:nightly
```

or

```
docker pull ghcr.io/airryco/spt-server:nightly
docker run -d --name spt-server -v ./spt-server:/opt/spt-server -e backendIp=192.168.1.1 -e backendPort=6969 -p 6969:6969 ghcr.io/airryco/spt-server:nightly
```

docker compose:

```yaml
services:
  spt-server:
    image: stblog/spt-server:nightly
    container_name: spt-server
    hostname: spt-server
    restart: unless-stopped
    volumes:
      - ./spt-server:/opt/spt-server
    network_mode: host
    environment:
      - backendIp=192.168.1.1
      - backendPort=6969
```
`backendIp`(optional): Your server IP, default is your container IP like `172.17.0.2`. If `network_mode` is set to `host`, then it will be your server IP by default

`backendPort`(optional): Your server port, default is `6969`

### 3.9(EFT 0.14)

```shell
docker run -d --name spt-server --restart always -p 6969:6969 -v ./spt-server:/opt/spt-server dev.sp-tarkov.com/medusa/spt-server
```

docker compose:

```yaml
services:
  spt-server:
  image: dev.sp-tarkov.com/medusa/spt-server
  container_name: spt-server
  restart: always
  volumes:
    - './spt-server:/opt/spt-server'
  ports:
    - '6969:6969'
```
