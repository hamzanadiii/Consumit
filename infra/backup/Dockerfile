FROM postgres:18-alpine
RUN apk add --no-cache ca-certificates restic openssh-client jq
COPY infra/backup/backup.sh /usr/local/bin/consumit-backup
COPY infra/backup/check.sh /usr/local/bin/consumit-backup-check
RUN chmod 0555 /usr/local/bin/consumit-backup /usr/local/bin/consumit-backup-check
ENTRYPOINT ["/usr/local/bin/consumit-backup"]
