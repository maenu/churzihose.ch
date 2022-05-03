#!/bin/sh

if echo -e "$RENEWED_DOMAINS" | grep --quiet 'churzihose.ch'
then
  cat "$RENEWED_LINEAGE/privkey.pem" > /opt/churzihose/privkey.pem
  cat "$RENEWED_LINEAGE/fullchain.pem" > /opt/churzihose/cert.pem
  cat "$RENEWED_LINEAGE/chain.pem" > /opt/churzihose/chain.pem
fi
