{
  description = "Hakimi CLI";

  inputs = {
    # Pinned to the 25.11 release channel so nodejs_24 satisfies the
    # >= 24.15.0 floor enforced by the native SEA build.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs =
    { self, nixpkgs }:
    let
      lib = nixpkgs.lib;

      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems =
        f:
        lib.genAttrs systems (
          system:
          f (import nixpkgs {
            inherit system;
          })
        );

      minNodeVersion = "24.15.0";
      pnpmVersion = "10.33.0";

      # Hardcode to Node.js 24.x; fail the evaluation if the pinned nixpkgs
      # does not offer a new enough 24.x.
      nodejsFor =
        pkgs:
        let
          node = pkgs.nodejs_24;
        in
        if lib.versionAtLeast node.version minNodeVersion then
          node
        else
          throw ''
            Hakimi requires Node.js >= ${minNodeVersion},
            but nixpkgs only offers ${node.version}.
            Pin a newer nixpkgs revision or update minNodeVersion in flake.nix.
          '';

      # nixpkgs 25.11 currently carries pnpm 10.28.0. Override its supported
      # derivation with the repository's exact packageManager version instead
      # of weakening the canonical Web build preflight inside the Nix sandbox.
      pnpmFor =
        pkgs:
        (pkgs.pnpm_10.override {
          nodejs = nodejsFor pkgs;
        }).overrideAttrs (_: {
          version = pnpmVersion;
          src = pkgs.fetchurl {
            url = "https://registry.npmjs.org/pnpm/-/pnpm-${pnpmVersion}.tgz";
            hash = "sha512-EFaLtKavtYyes2MNqQzJUWQXq+vT+rvmc58K55VyjaFJHp21pUTHatjrdXD1xLs9bGN7LLQb/c20f6gjyGSTGQ==";
          };
        });

      # -------------------------------------------------------------------
      # Workspace members (kept in sync with pnpm-workspace.yaml).
      #
      # HARD REQUIREMENT: whenever you add or remove a workspace package,
      # you MUST update both lists below. Missing a path will break the Nix
      # build (src fileset silently drops files); missing a name will break
      # pnpmConfigHook (dependencies for that workspace won't be fetched).
      # -------------------------------------------------------------------
      workspacePaths = [
        ./packages/acp-adapter
        ./packages/acp-server
        ./packages/agent-core
        ./packages/agent-core-v2
        ./packages/kap-server
        ./packages/kaos
        ./packages/klient
        ./packages/kosong
        ./packages/migration-legacy
        ./packages/minidb
        ./packages/node-sdk
        ./packages/oauth
        ./packages/pi-tui
        ./packages/protocol
        ./packages/telemetry
        ./packages/transcript
        ./packages/tree-sitter-bash
        ./apps/kimi-code
        ./apps/kimi-web
        ./apps/vscode
        ./apps/kimi-inspect
        ./apps/vis
        ./apps/vis/server
        ./apps/vis/web
        ./docs
      ];

      workspaceNames = [
        "@moonshot-ai/acp-adapter"
        "@moonshot-ai/acp-server"
        "@moonshot-ai/agent-core"
        "@moonshot-ai/agent-core-v2"
        "@moonshot-ai/kap-server"
        "@moonshot-ai/kaos"
        "@moonshot-ai/kosong"
        "@moonshot-ai/migration-legacy"
        "@moonshot-ai/minidb"
        "@bhjia-phys/hakimi-sdk"
        "@moonshot-ai/kimi-code-oauth"
        "@moonshot-ai/klient"
        "@moonshot-ai/pi-tui"
        "@moonshot-ai/protocol"
        "@moonshot-ai/kimi-telemetry"
        "@moonshot-ai/transcript"
        "@moonshot-ai/tree-sitter-bash"
        "@bhjia-phys/hakimi"
        "@bhjia-phys/hakimi-web"
        "kimi-code"
        "@moonshot-ai/kimi-inspect"
        "@moonshot-ai/vis"
        "@moonshot-ai/vis-server"
        "@moonshot-ai/vis-web"
        "kimi-code-docs"
      ];
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          nodejs = nodejsFor pkgs;
          pnpm = pnpmFor pkgs;
          appPackageJson = builtins.fromJSON (builtins.readFile ./apps/kimi-code/package.json);
          nativeTarget =
            if pkgs.stdenv.hostPlatform.isLinux && pkgs.stdenv.hostPlatform.isAarch64 then
              "linux-arm64"
            else if pkgs.stdenv.hostPlatform.isLinux then
              "linux-x64"
            else if pkgs.stdenv.hostPlatform.isDarwin && pkgs.stdenv.hostPlatform.isAarch64 then
              "darwin-arm64"
            else if pkgs.stdenv.hostPlatform.isDarwin then
              "darwin-x64"
            else
              throw "Unsupported Hakimi native target for ${pkgs.stdenv.hostPlatform.system}";

          hakimi = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "hakimi";
            version = appPackageJson.version;

            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions (
                [
                  ./build
                  ./.npmrc
                  ./.nvmrc
                  ./flake.lock
                  ./package.json
                  ./pnpm-lock.yaml
                  ./pnpm-workspace.yaml
                  ./tsconfig.json
                  ./vitest.config.ts
                  ./LICENSE
                ]
                ++ workspacePaths
              );
            };

            pnpmWorkspaces = [ "." ] ++ workspaceNames;

            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src pnpmWorkspaces;
              inherit pnpm;
              fetcherVersion = 3;
              hash = "sha256-ErjlsRKHvjzKaiClrgjy82IqsyLa6nKr1ei+j31RhjQ=";
            };

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.pnpmConfigHook
              pkgs.makeWrapper
            ]
            # The SEA inject step (postject) invalidates the macOS code
            # signature on the copied Node executable; build.mjs then re-applies
            # an ad-hoc signature via `codesign`. The Nix darwin sandbox does
            # not expose /usr/bin/codesign, so we supply nixpkgs' ad-hoc-only
            # replacement instead.
            ++ lib.optionals pkgs.stdenv.hostPlatform.isDarwin [
              pkgs.darwin.sigtool
            ];

            # The SEA binary is produced by `postject`-injecting a blob into a
            # plain Node executable. Stripping rewrites section tables and can
            # invalidate the injected blob's offsets, so leave the binary
            # untouched after the build.
            dontStrip = true;

            buildPhase = ''
              runHook preBuild
              export KIMI_CODE_BUILD_TARGET=${nativeTarget}
              ${lib.optionalString pkgs.stdenv.hostPlatform.isDarwin ''
                # pkgs.darwin.sigtool's codesign supports `--sign -` (ad-hoc)
                # but not the inspection mode (`-dv`) that 05-verify.mjs runs
                # afterwards. Disable the verify step for the Nix build; the
                # release CI keeps it via the unmodified script.
                substituteInPlace apps/kimi-code/scripts/native/build.mjs \
                  --replace-fail \
                    "await runVerifyStep({ requireGatekeeper: false });" \
                    "// runVerifyStep skipped in nix sandbox (sigtool lacks -dv)"
              ''}
              # First prove the tracked bundle matches a clean source rebuild;
              # only then replace it for consumption and verify the installed
              # result. pnpmFor supplies the exact canonical pnpm version.
              pnpm run build:web-assets -- --check
              pnpm run build:web-assets
              pnpm run build:web-assets -- --check
              pnpm --filter=@bhjia-phys/hakimi run build:native:sea
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              install -Dm755 \
                "apps/kimi-code/dist-native/bin/${nativeTarget}/hakimi" \
                "$out/bin/hakimi"
              ln -s "$out/bin/hakimi" "$out/bin/kimi"

              runHook postInstall
            '';

            postInstall = ''
              wrapProgram $out/bin/kimi --prefix PATH : ${lib.makeBinPath [ pkgs.ripgrep pkgs.fd ]}
            '';

            meta = {
              description = "Truth-seeking physics research agent";
              homepage = "https://github.com/bhjia-phys/Hakimi";
              license = lib.licenses.mit;
              mainProgram = "hakimi";
              platforms = systems;
            };
          });
        in
        {
          inherit hakimi;
          kimi-code = hakimi;
          default = hakimi;
        }
      );

      apps = forAllSystems (pkgs: {
        hakimi = {
          type = "app";
          program = "${self.packages.${pkgs.system}.hakimi}/bin/hakimi";
        };
        kimi-code = self.apps.${pkgs.system}.hakimi;
        default = self.apps.${pkgs.system}.hakimi;
      });

      devShells = forAllSystems (pkgs: {
        default =
          let
            nodejs = nodejsFor pkgs;
            pnpm = pnpmFor pkgs;
          in
          pkgs.mkShell {
            packages = [
              nodejs
              pnpm
              pkgs.ripgrep
              pkgs.fd
            ];
          };
      });
    };
}
