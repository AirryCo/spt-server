FROM debian:bookworm-slim
LABEL author="AirryCo <henry@stblog.com.cn>"
ENV TZ=Asia/Shanghai
VOLUME /opt/spt-server

ADD spt-server.tgz /app
ADD fika-server.tgz /app/spt-server
WORKDIR /opt/spt-server
EXPOSE 6969
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

