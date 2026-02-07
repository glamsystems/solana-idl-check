import * as core from "@actions/core";

// Map GitHub Action inputs to environment variables expected by check-idl.ts
const rpcUrl = core.getInput("rpc-url", { required: true });
const programId = core.getInput("program-id", { required: true });

process.env.RPC_URL = rpcUrl;
process.env.PROGRAM_ID = programId;

// Run the main check
import("./check-idl");
