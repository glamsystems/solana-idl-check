import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  SOLANA_CLUSTER: process.env.SOLANA_CLUSTER || 'mainnet-beta',
  HELIUS_API_KEY: process.env.HELIUS_API_KEY,
  PROGRAM_ID: process.env.PROGRAM_ID,
  IDL_ACCOUNT: process.env.IDL_ACCOUNT,
  LOOKBACK_LIMIT: parseInt(process.env.LOOKBACK_LIMIT || '100', 10),
};

// Constants
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

interface HeliusTx {
  signature: string;
  timestamp: number; // Unix timestamp
  blockTime?: number;
  type: string;
  source: string;
}

/**
 * Main Health Check Function
 */
async function main() {
  console.log('🔍 Solana IDL Health Check initialized...');
  validateConfig();

  // 1. Resolve ProgramData Account
  const programId = new PublicKey(CONFIG.PROGRAM_ID!);
  const connection = new Connection(`https://api.${CONFIG.SOLANA_CLUSTER}.solana.com`);
  
  console.log(`\nTARGET PROGRAM: ${programId.toBase58()}`);
  
  const programDataAddress = await getProgramDataAddress(connection, programId);
  if (!programDataAddress) {
    console.log('⚠️  Program is not upgradeable (no ProgramData account found).');
    console.log('   IDL checks are not applicable for immutable programs via this method.');
    process.exit(0);
  }
  
  console.log(`PROGRAM DATA:   ${programDataAddress.toBase58()}`);
  console.log(`IDL ACCOUNT:    ${CONFIG.IDL_ACCOUNT}`);

  // 2. Fetch Latest Upgrade Times
  console.log('\nFetching transaction history via Helius...');

  const [programUpgrade, idlUpgrade] = await Promise.all([
    getLatestTransaction(programDataAddress.toBase58(), 'ProgramData'),
    getLatestTransaction(CONFIG.IDL_ACCOUNT!, 'IDL Account')
  ]);

  // 3. Compare and Report
  printReport(programId.toBase58(), programDataAddress.toBase58(), programUpgrade, idlUpgrade);

  // 4. Determine Pass/Fail
  if (!programUpgrade) {
    console.log('❓ No transaction history found for ProgramData. Cannot determine upgrade status.');
    process.exit(0); // Warn but don't fail CI, might be a very old program or inactive API
  }

  if (!idlUpgrade) {
    console.error('❌ FAILURE: IDL account has no history. Is it initialized?');
    process.exit(1);
  }

  // Comparison
  if (programUpgrade.timestamp > idlUpgrade.timestamp) {
    console.error('\n🚨 RESULT: OUTDATED');
    console.error('   The program was upgraded AFTER the last IDL update.');
    console.error('   Developers may be integrating against stale types.');
    console.error(`\n👉 ACTION: anchor idl upgrade ${programId.toBase58()} -f target/idl/<program>.json`);
    process.exit(1);
  } else {
    console.log('\n✅ RESULT: OK');
    console.log('   IDL is up-to-date or newer than the last program binary deployment.');
    process.exit(0);
  }
}

/**
 * Helpers
 */

function validateConfig() {
  const missing = [];
  if (!CONFIG.HELIUS_API_KEY) missing.push('HELIUS_API_KEY');
  if (!CONFIG.PROGRAM_ID) missing.push('PROGRAM_ID');
  if (!CONFIG.IDL_ACCOUNT) missing.push('IDL_ACCOUNT');

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

async function getProgramDataAddress(connection: Connection, programId: PublicKey): Promise<PublicKey | null> {
  const info = await connection.getAccountInfo(programId);
  if (!info) {
    throw new Error(`Program account ${programId.toBase58()} not found on ${CONFIG.SOLANA_CLUSTER}`);
  }

  if (!info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    return null; // Not an upgradeable program
  }

  // The Program account for an upgradeable program contains:
  // [0..3]: 3 (Program State enum)
  // [4..36]: ProgramData Address
  const buffer = info.data;
  // Check if it's the specific "Program" state of the loader
  // (Layout: status (u32), programdata_address (Pubkey))
  // Status 3 = Program
  const status = buffer.readUInt32LE(0);
  if (status !== 3) {
    return null;
  }

  return new PublicKey(buffer.subarray(4, 36));
}

async function getLatestTransaction(address: string, label: string): Promise<HeliusTx | null> {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions`;
    const response = await axios.get(url, {
      params: {
        'api-key': CONFIG.HELIUS_API_KEY,
        // We only need the latest one, but fetching a small batch ensures we don't miss anything 
        // if there are failed txs (though Helius usually returns all).
        // Helius API sorts by NEWEST first by default.
      }
    });

    const txs = response.data as HeliusTx[];

    if (!txs || txs.length === 0) {
      return null;
    }

    // Return the most recent one
    return txs[0];
  } catch (err: any) {
    console.error(`❌ Error fetching history for ${label}:`, err.message);
    if (axios.isAxiosError(err) && err.response) {
       console.error('   Response:', err.response.data);
    }
    throw err;
  }
}

function printReport(progId: string, progData: string, progTx: HeliusTx | null, idlTx: HeliusTx | null) {
  console.log('\n📊 STATUS REPORT');
  console.log('================');
  console.log(`Program ID:       ${progId}`);
  console.log(`ProgramData:      ${progData}`);
  console.log(`IDL Account:      ${CONFIG.IDL_ACCOUNT}`);
  console.log('----------------');
  
  console.log('Latest Program Upgrade:');
  if (progTx) {
    console.log(`  Time:      ${new Date(progTx.timestamp * 1000).toISOString()}`);
    console.log(`  Signature: ${progTx.signature}`);
  } else {
    console.log('  [No Data]');
  }

  console.log('\nLatest IDL Upgrade:');
  if (idlTx) {
    console.log(`  Time:      ${new Date(idlTx.timestamp * 1000).toISOString()}`);
    console.log(`  Signature: ${idlTx.signature}`);
  } else {
    console.log('  [No Data]');
  }
  console.log('================');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
