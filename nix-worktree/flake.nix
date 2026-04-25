{
  description = "Per-worktree PostgreSQL bootstrap with Traefik routing";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system:
          let
            pkgs = import nixpkgs { inherit system; };
          in
          f pkgs
        );

      packageSet = pkgs: with pkgs; [
        bash
        coreutils
        findutils
        gawk
        gnugrep
        gnused
        jq
        lsof
        openssl
        postgresql_16
        traefik
        util-linux
      ];
    in {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = packageSet pkgs;
        };

        worktree-db = pkgs.mkShell {
          packages = packageSet pkgs;
        };
      });
    };
}
