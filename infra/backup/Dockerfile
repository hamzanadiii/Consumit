FROM postgres:17-alpine
RUN apk add --no-cache ca-certificates restic openssh-client jq
COPY infra/backup/backup.sh /usr/local/bin/consumit-backup
COPY infra/backup/check.sh /usr/local/bin/consumit-backup-check
COPY infra/backup/init.sh /usr/local/bin/consumit-backup-init
RUN chmod 0555 /usr/local/bin/consumit-backup /usr/local/bin/consumit-backup-check /usr/local/bin/consumit-backup-init
ENTRYPOINT ["/usr/local/bin/consumit-backup"]
