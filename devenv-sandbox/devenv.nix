{ config, pkgs, ... }:

{
  packages = [
    pkgs.nodejs_24
    pkgs.pnpm
  ];

  env.BETTER_AUTH_SECRET = "development-only-better-auth-secret-change-before-production";

  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    listen_addresses = "127.0.0.1";
    createDatabase = false;
  };

  processes.postgres = {
    before = [ "db:prepare" ];
  };

  processes.web = {
    ports.http.allocate = 5173;
    exec = ''
      BETTER_AUTH_URL="http://127.0.0.1:${toString config.processes.web.ports.http.value}" \
        DATABASE_URL="postgres://twitter:twitter@127.0.0.1:$PGPORT/twitter_like" \
        pnpm dev -- --host 127.0.0.1 --port ${toString config.processes.web.ports.http.value}
    '';
    after = [
      "db:push@succeeded"
    ];
  };

  tasks."db:prepare" = {
    exec = ''
      psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM pg_catalog.pg_roles WHERE rolname = 'twitter'
        ) THEN
          CREATE ROLE twitter LOGIN PASSWORD 'twitter';
        ELSE
          ALTER ROLE twitter WITH LOGIN PASSWORD 'twitter';
        END IF;
      END
      $$;

      SELECT 'CREATE DATABASE twitter_like OWNER twitter'
      WHERE NOT EXISTS (
        SELECT FROM pg_database WHERE datname = 'twitter_like'
      )\gexec
      SQL

      psql -h "$PGHOST" -p "$PGPORT" -d twitter_like -v ON_ERROR_STOP=1 <<'SQL'
      ALTER DATABASE twitter_like OWNER TO twitter;
      ALTER SCHEMA public OWNER TO twitter;
      GRANT ALL ON SCHEMA public TO twitter;
      SQL
    '';
    before = [ "db:push" ];
  };

  tasks."db:push" = {
    exec = ''
      DATABASE_URL="postgres://twitter:twitter@127.0.0.1:$PGPORT/twitter_like" pnpm db:push
    '';
    after = [ "db:prepare@succeeded" ];
    before = [ "devenv:processes:web" ];
  };

  enterShell = ''
    export DATABASE_URL="postgres://twitter:twitter@127.0.0.1:$PGPORT/twitter_like"
    echo "devenv ready: pnpm install && devenv up"
  '';
}
