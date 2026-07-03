{
  description = "apple/container x git worktree demo (postgres + redis + Go API)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # apple/container runs on Apple silicon macOS only.
      system = "aarch64-darwin";
      pkgs = nixpkgs.legacyPackages.${system};

      # Linux arm64 static busybox, used to debug DNS from *inside* a distroless
      # container without installing a shell there. Build once, then:
      #   container run --rm --network default \
      #     -v "$(nix path-info nixpkgs#pkgsCross.aarch64-multiplatform.pkgsStatic.busybox)/bin/busybox:/busybox:ro" \
      #     --entrypoint /busybox alpine:latest nslookup db.test 192.168.64.1
      linuxStatic = nixpkgs.legacyPackages.aarch64-linux.pkgsStatic;
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          go           # build the API image
          jq           # parse container inspect / API JSON
          dnsutils     # dig / nslookup against 127.0.0.1:2053 and 192.168.64.1
          git          # worktree commands
        ];
      };

      # Expose the static busybox for ad-hoc container debugging.
      packages.${system}.busybox-static = linuxStatic.busybox;
    };
}
