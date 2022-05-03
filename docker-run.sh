#!/bin/sh
set -e

if [ -z "$INFOMANIAK_API_TOKEN" ]
then
	echo "INFOMANIAK_API_TOKEN not set"
	exit 1
fi
if [ -z "$CHURZIHOSE" ]
then
	echo "CHURZIHOSE not set"
	exit 1
fi
if [ -z "$PGDATA" ]
then
	echo "PGDATA not set"
	exit 1
fi

cd $CHURZIHOSE

if [ ! -f cert.pem ]
then
 	echo 'SYSLOGD_OPTS="-t"' > /etc/conf.d/syslog
 	rc-service crond start
 	rc-update add crond
 	echo -e '#!/bin/sh\ncertbot renew -q' > /etc/periodic/weekly/renew-certs
 	chmod a+x /etc/periodic/weekly/renew-certs
	certbot certonly \
		--non-interactive \
		--agree-tos \
		--email 'maenu@maenulabs.ch' \
		--authenticator dns-infomaniak \
		--server https://acme-v02.api.letsencrypt.org/directory \
		--preferred-chain 'ISRG Root X1' \
		--rsa-key-size 4096 \
		-d '*.churzihose.ch' \
		-d 'churzihose.ch'
	RENEWED_DOMAINS=churzihose.ch RENEWED_LINEAGE=/etc/letsencrypt/live/churzihose.ch /etc/letsencrypt/renewal-hooks/deploy/churzihose
fi

setcap 'cap_net_bind_service=+ep' $(which node)
su postgres -c 'pg_ctl start --options="-k /tmp"'
while true
do
  NODE_ENV=production node index.js
  sleep 1
done
