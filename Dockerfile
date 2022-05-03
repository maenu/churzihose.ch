FROM alpine

ENV CHURZIHOSE=/opt/churzihose
ENV PGDATA=$CHURZIHOSE/db

EXPOSE 80/tcp
EXPOSE 443/tcp

RUN apk add --no-cache \
        wget \
        unzip \
        postgis \
        openjdk17-jre-headless \
        nodejs \
        npm \
        certbot \
        libcap \
        python3 \
        py3-pip && \
    pip install --upgrade pip && \
    pip install wheel certbot-dns-infomaniak

RUN mkdir -p $CHURZIHOSE && \
    mkdir -p $PGDATA && \
    chown postgres:postgres $PGDATA

WORKDIR $CHURZIHOSE

RUN wget https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/PLZO_INTERLIS_LV03.zip && \
    unzip PLZO_INTERLIS_LV03.zip && \
    wget https://downloads.interlis.ch/ili2pg/ili2pg-4.7.0.zip && \
    unzip ili2pg-4.7.0.zip -d ili2pg-4.7.0

RUN su postgres -c 'pg_ctl init --options="--auth=trust"' && \
	su postgres -c 'pg_ctl start --options="-k /tmp"' && \
    su postgres -c 'createdb -h /tmp plz' && \
	su postgres -c 'psql -h /tmp -c "CREATE EXTENSION IF NOT EXISTS plpgsql; CREATE EXTENSION postgis;" plz' && \
    su postgres -c 'pg_ctl stop'

RUN su postgres -c 'pg_ctl start --options="-k /tmp"' && \
    su postgres -c 'java -jar ili2pg-4.7.0/ili2pg-4.7.0.jar --schemaimport --createGeomIdx --defaultSrsAuth EPSG --defaultSrsCode 21781 --dbdatabase plz --dbusr postgres PLZO_INTERLIS_LV03/PLZO-CH_LV03_1d_ili1.ili' && \
    su postgres -c 'java -jar ili2pg-4.7.0/ili2pg-4.7.0.jar --import --dbdatabase plz --dbusr postgres PLZO_INTERLIS_LV03/PLZO_ITF_LV03.itf' && \
	su postgres -c 'pg_ctl stop'

RUN rm -rf ili2pg-4.7.0* PLZO_INTERLIS_LV03* && \
    apk del openjdk17-jre-headless

COPY ./certbot-deploy.sh /etc/letsencrypt/renewal-hooks/deploy/churzihose
RUN chmod a+x /etc/letsencrypt/renewal-hooks/deploy/churzihose
COPY ./package.json .
RUN NODE_ENV=production npm install
COPY ./docker-run.sh .
COPY ./icon-192.png .
COPY ./icon-512.png .
COPY ./models.csv .
COPY ./index.html .
COPY ./index.js .
COPY ./manifest.json .

CMD ["./docker-run.sh"]
