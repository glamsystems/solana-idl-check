import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";

// dotenv is a no-op when env vars are already set (e.g. in GitHub Actions)
dotenv.config();

const programId = new PublicKey(process.env.PROGRAM_ID!);
const connection = new Connection(process.env.RPC_URL!);
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

interface TxData {
  signature: string;
  blockTime?: number;
  slot: number;
}

async function main() {
  validateConfig();

  const programDataAddress = await getProgramDataAddress(connection, programId);
  if (!programDataAddress) {
    console.log(
      "⚠️  Program is not upgradeable (no ProgramData account found).",
    );
    console.log(
      "   IDL checks are not applicable for immutable programs via this method.",
    );
    process.exit(0);
  }
  const idlPda = await getIdlPda(programId);

  const [programUpgradeTx, idlUpgradeTx] = await Promise.all([
    getLatestTransaction(programDataAddress.toBase58(), "ProgramData"),
    getLatestTransaction(idlPda.toBase58(), "IdlAccount"),
  ]);

  if (!programUpgradeTx) {
    console.error("❌ No transaction history found for ProgramData.");
    process.exit(1);
  }

  if (!idlUpgradeTx) {
    console.error("❌ IDL account has no history. Is it initialized?");
    process.exit(1);
  }

  printReport(
    programId.toBase58(),
    programDataAddress.toBase58(),
    idlPda.toBase58(),
    programUpgradeTx,
    idlUpgradeTx,
  );

  if (programUpgradeTx.slot > idlUpgradeTx.slot) {
    console.error("\n🚨 RESULT: OUTDATED");
    console.error("   The program was upgraded AFTER the last IDL update.");
    console.error("   Developers may be integrating against stale types.");
    console.error(
      `\n👉 ACTION: anchor idl upgrade ${programId.toBase58()} -f target/idl/<program>.json`,
    );
    process.exit(1);
  } else {
    console.log("\n✅ RESULT: OK");
    console.log(
      "   IDL is up-to-date or newer than the last program binary deployment.",
    );
    process.exit(0);
  }
}

function validateConfig() {
  const missing = [];
  if (!process.env.RPC_URL) missing.push("RPC_URL");
  if (!process.env.PROGRAM_ID) missing.push("PROGRAM_ID");

  if (missing.length > 0) {
    console.error("❌ Missing required inputs: " + missing.join(", "));
    process.exit(1);
  }
}

async function getProgramDataAddress(
  connection: Connection,
  programId: PublicKey,
): Promise<PublicKey | null> {
  const info = await connection.getAccountInfo(programId);
  if (!info) {
    throw new Error(`Program account ${programId} not found`);
  }

  if (!info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    throw new Error(
      `Expected BPF loader, got: ${info.owner} for program ${programId}`,
    );
  }

  return new PublicKey(info.data.subarray(4, 36));
}

async function getIdlPda(programId: PublicKey): Promise<PublicKey> {
  const base = PublicKey.findProgramAddressSync([], programId)[0];
  const idlPda = await PublicKey.createWithSeed(base, "anchor:idl", programId);
  return idlPda;
}

async function getLatestTransaction(
  address: string,
  label: string,
): Promise<TxData | null> {
  try {
    const response = await fetch(process.env.RPC_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [
          address,
          {
            limit: 1,
          },
        ],
      }),
    });

    const data = await response.json();
    const txs = data.result as TxData[];

    if (!txs || txs.length === 0) {
      return null;
    }

    // Return the most recent one
    return txs[0];
  } catch (err: any) {
    console.error(`❌ Error fetching history for ${label}:`, err.message);
    throw err;
  }
}

function printReport(
  programId: string,
  programData: string,
  idlAccount: string,
  programUpgradeTx: TxData | null,
  idlUpgradeTx: TxData | null,
) {
  console.log("📊 STATUS REPORT");
  console.log("================");
  console.log(`Program ID:       ${programId}`);
  console.log(`ProgramData:      ${programData}`);
  console.log(`Idl Account:      ${idlAccount}`);
  console.log("----------------");

  console.log("Latest Program Upgrade:");
  if (programUpgradeTx) {
    console.log(`  Slot:      ${programUpgradeTx.slot}`);
    console.log(`  Block Time: ${programUpgradeTx.blockTime}`);
    console.log(`  Signature: ${programUpgradeTx.signature}`);
  } else {
    console.log("  [No Data]");
  }

  console.log("\nLatest IDL Upgrade:");
  if (idlUpgradeTx) {
    console.log(`  Slot:      ${idlUpgradeTx.slot}`);
    console.log(`  Block Time: ${idlUpgradeTx.blockTime}`);
    console.log(`  Signature: ${idlUpgradeTx.signature}`);
  } else {
    console.log("  [No Data]");
  }
  console.log("================");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
