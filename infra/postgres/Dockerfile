FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends pgbackrest jq openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY infra/postgres/entrypoint.sh /usr/local/bin/consumit-postgres
COPY infra/postgres/init.sh /docker-entrypoint-initdb.d/10-consumit.sh
COPY infra/postgres/metrics.sh /usr/local/bin/consumit-postgres-metrics
COPY infra/postgres/pg_hba.conf /etc/consumit/pg_hba.conf
COPY infra/postgres/pg_ident.conf /etc/consumit/pg_ident.conf
RUN chmod 0555 /usr/local/bin/consumit-postgres /usr/local/bin/consumit-postgres-metrics /docker-entrypoint-initdb.d/10-consumit.sh
ENTRYPOINT ["consumit-postgres"]
CMD ["postgres"]
