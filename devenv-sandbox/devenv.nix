{ config, pkgs, ... }:

{
  packages = [
    pkgs.nodejs_24
    pkgs.pnpm
  ];

  env.AUTH_SECRET = "development-only-auth-secret-change-before-production";
  env.PORTLESS_PORT = "1355";
  env.PORTLESS_SYNC_HOSTS = "0";

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
      DATABASE_URL="postgres://twitter:twitter@127.0.0.1:$PGPORT/twitter_like" \
        PORTLESS_APP_PORT=${toString config.processes.web.ports.http.value} \
        pnpm dev
    '';
    after = [
      "db:push@succeeded"
    ];
  };

  processes.studio = {
    ports.http.allocate = 4983;
    exec = ''
      DATABASE_URL="postgres://twitter:twitter@127.0.0.1:$PGPORT/twitter_like" \
        pnpm exec drizzle-kit studio --host 127.0.0.1 --port ${toString config.processes.studio.ports.http.value}
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
    echo "app: https://echodeck.localhost:1355"
    echo "studio: check the studio process log for the local.drizzle.studio URL"
  '';
}
