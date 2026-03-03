# Confidential Execution Engine — Contracts

EVM smart contract layer for the Confidential Execution Engine. Supports workflow creation, execution finalization with commitment-only storage, EIP-712, and TEE attestation (stubbed).

## Stack

- **Solidity** 0.8.24
- **Hardhat** — TypeScript, compilation, multi-chain deployment
- **Foundry** — Contract tests (`forge test`)
- **OpenZeppelin** — ReentrancyGuard, EIP-712 utilities

## Setup

```bash
# Install Node deps (OpenZeppelin, Hardhat, etc.)
npm install

# Install Forge std library for tests (required for Foundry)
forge install foundry-rs/forge-std --no-commit
```

Copy `.env.example` to `.env` and set RPC URLs and `PRIVATE_KEY` for deployment.

## Build

```bash
# Hardhat
npm run compile

# Foundry
forge build
```

## Test

```bash
# Foundry (recommended for contract tests)
npm run test:foundry
# or: forge test

# Hardhat
npm run test
```

## Deploy

Multi-chain deployment uses a single script and the selected network:

```bash
# Default script (uses --network)
npx hardhat run scripts/deploy.ts --network sepolia
```

Per-chain scripts:

```bash
npx hardhat run scripts/deploy-ethereum.ts --network ethereum
npm run deploy:sepolia
npx hardhat run scripts/deploy-polygon.ts --network polygon
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
npx hardhat run scripts/deploy-base.ts --network base
```

### Sepolia deployment and full E2E flow

1. **Deploy** (from `contract/`):  
   `npm run deploy:sepolia`  
   Requires `SEPOLIA_RPC_URL` and `PRIVATE_KEY` in `.env`.  
   Prints `DEPLOYED_ADDRESS: 0x...`.

2. **Set engine env**: Copy `DEPLOYED_ADDRESS` into `engine/.env` as `CONTRACT_ADDRESS`. Set `RPC_URL` (Sepolia), `PRIVATE_KEY`, `CHAIN_ID=11155111`, `MIN_CONFIRMATIONS=1`, `WORKFLOW_CREATOR_ALLOWLIST=<deployer address>`, and any CRA/API keys (see `engine/.env.example`).

3. **Create workflow** (from `contract/`):  
   Set `CONTRACT_ADDRESS` in `contract/.env` to the same deployed address, then run:  
   `npm run create:sepolia`  
   Creates a test workflow (hash `keccak256("test-workflow")`, SEALED_BID_AUCTION, ESCROW) and prints `WORKFLOW_ID: 1`.

4. **Start engine** (from `engine/`):  
   `npm run dev`

5. **Run E2E** (in another terminal, from `engine/`):  
   `npm run e2e`  
   Validates: WorkflowCreated → engine execution → finalizeExecution → commitment stored → finalized true. Timeout 60s; exits with code 1 on failure.

## Contract

- **ConfidentialExecutionEngine** — Workflow registry, execution records (commitment hash only), replay protection via nonce, `OnlyActiveWorkflow` and `NonReentrant` modifiers. EIP-712 typehash for `FinalizeExecution`. `verifyAttestation` is stubbed (TODO: TEE attestation).

Module types: `SEALED_BID_AUCTION`, `PRIVATE_VOTING`.  
Settlement modes: `ESCROW`, `PRIVATE_SETTLEMENT`.

Events: `WorkflowCreated`, `ExecutionFinalized`.
