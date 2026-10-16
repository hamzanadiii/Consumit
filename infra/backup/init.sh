#!/bin/sh
set -eu
export AWS_ACCESS_KEY_ID="$(jq -er .accessKeyId "$AWS_CREDENTIALS_FILE")"
export AWS_SECRET_ACCESS_KEY="$(jq -er .secretAccessKey "$AWS_CREDENTIALS_FILE")"
export AWS_SESSION_TOKEN="$(jq -r '.sessionToken // empty' "$AWS_CREDENTIALS_FILE")"
exec restic init
