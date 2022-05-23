docker push maenuleu/ch.churzihose:latest
docker run maenuleu/ch.churzihose:latest
docker run -it maenuleu/ch.churzihose:latest
docker run --publish 443:443 --publish 80:80 maenuleu/ch.churzihose:latest
docker run -d -it --mount type=bind,source="$(pwd)",target=/opt/src,readonly maenuleu/ch.churzihose:latest-dev
