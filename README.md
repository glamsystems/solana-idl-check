# Solana IDL Health Check

A GitHub Action (and CLI tool) that detects outdated on-chain Solana IDLs by comparing the latest program upgrade slot to the latest IDL upgrade slot.

If the program binary was upgraded **after** the IDL was last updated, the check fails — alerting you that developers may be integrating against stale types.

## Usage as a GitHub Action

```yaml
name: IDL Check

on:
  schedule:
    - cron: "0 0 * * *" # daily at 00:00 UTC
  workflow_dispatch:

jobs:
  check-idl:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        program:
          - name: program_name_1
            id: YourProgramId111111111111111111111111111111
          - name: program_name_2
            id: YourProgramId111111111111111111111111111112
    name: check-idl (${{ matrix.program.name }})
    steps:
      - uses: glamsystems/solana-idl-check@v1.0.1
        env:
          RPC_URL: "https://mainnet.helius-rpc.com/?api-key=${{ secrets.HELIUS_API_KEY }}"
        with:
          rpc-url: ${{ env.RPC_URL }}
          program-id: ${{ matrix.program.id }}
```

### Inputs

> ⚠️ **Security:** `rpc-url` often contains an API key. Always pass it via `${{ secrets.RPC_URL }}`, never as a plaintext value or repository variable.

| Input        | Required | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `rpc-url`    | ✅       | Solana RPC endpoint URL (pass as a **secret**) |
| `program-id` | ✅       | The on-chain program address to monitor        |

### Outputs

The action exits with code **1** (fails the workflow) if:

- The IDL is outdated (program upgraded after last IDL update)
- No ProgramData transaction history found
- IDL account has no history

Exits with code **0** if the IDL is up to date.

## Usage as a CLI tool

```bash
git clone https://github.com/glamsystems/solana-idl-check.git
cd solana-idl-check
npm install
```

Run:

```bash
RPC_URL=https://your-rpc-endpoint.com \
  PROGRAM_ID=YourProgramId111111111111111111111111111111 \
  npm run check
```

## Publishing a new version

After making changes to the source, rebuild the action bundle and commit it:

```bash
npm run build:action
git add dist/action/
git commit -m "rebuild action bundle"
```

Then tag a release:

```bash
git tag -a v1 -m "v1 release"
git push origin v1
```
