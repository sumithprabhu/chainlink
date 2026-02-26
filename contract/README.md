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
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
npx hardhat run scripts/deploy-polygon.ts --network polygon
npx hardhat run scripts/deploy-arbitrum.ts --network arbitrum
npx hardhat run scripts/deploy-base.ts --network base
```

## Contract

- **ConfidentialExecutionEngine** — Workflow registry, execution records (commitment hash only), replay protection via nonce, `OnlyActiveWorkflow` and `NonReentrant` modifiers. EIP-712 typehash for `FinalizeExecution`. `verifyAttestation` is stubbed (TODO: TEE attestation).

Module types: `SEALED_BID_AUCTION`, `PRIVATE_VOTING`.  
Settlement modes: `ESCROW`, `PRIVATE_SETTLEMENT`.

Events: `WorkflowCreated`, `ExecutionFinalized`.
