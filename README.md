# Solana IDL Health Check

A GitHub Action (and CLI tool) that detects outdated on-chain Solana IDLs by comparing the latest program upgrade slot to the latest IDL upgrade slot.

If the program binary was upgraded **after** the IDL was last updated, the check fails — alerting you that developers may be integrating against stale types.

## Usage as a GitHub Action

```yaml
name: IDL Health Check

on:
  schedule:
    - cron: "0 0 * * *" # daily
  workflow_dispatch:

jobs:
  check-idl:
    runs-on: ubuntu-latest
    steps:
      - uses: your-org/solana-idl-monitor@v1
        with:
          rpc-url: ${{ secrets.RPC_URL }}
          program-id: "YourProgramId111111111111111111111111111111"
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
git clone https://github.com/your-org/solana-idl-monitor.git
cd solana-idl-monitor
npm install
```

Create a `.env` file:

```
RPC_URL=https://your-rpc-endpoint.com
PROGRAM_ID=YourProgramId111111111111111111111111111111
```

Run:

```bash
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
