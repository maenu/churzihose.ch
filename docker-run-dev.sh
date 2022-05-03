#!/bin/sh
set -e

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

setcap 'cap_net_bind_service=+ep' $(which node)
su postgres -c 'pg_ctl start --options="-k /tmp"'
NODE_ENV=production node docker-run-dev.js
