#!/bin/sh
set -e

/app/node_modules/.bin/prisma migrate deploy
/app/node_modules/.bin/prisma db seed
exec node dist/main.js
