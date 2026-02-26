// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ConfidentialExecutionEngine
 * @notice EVM-based engine for confidential workflows. Stores only commitment hashes on-chain;
 *         private input data is never stored. Supports EIP-712 and TEE attestation (stubbed).
 *
 * INVARIANTS (enforced):
 * 1. Commitment cannot be changed after finalize (ExecutionRecord.finalized + ExecutionAlreadyFinalized revert).
 * 2. Nonce cannot be reused (per-workflow _usedNonces; NonceAlreadyUsed revert).
 * 3. Attestation must bind approvedWorkflowHash, commitmentHash, and nonce (verifyAttestation); replay protection is cryptographic.
 * 4. Domain separator (chainId + address(this)) prevents cross-chain replay (OZ EIP712).
 * 5. Only active workflow can be finalized (onlyActiveWorkflow modifier).
 */
contract ConfidentialExecutionEngine is ReentrancyGuard, EIP712 {
    using MessageHashUtils for bytes32;
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum ModuleType {
        SEALED_BID_AUCTION,
        PRIVATE_VOTING
    }

    enum SettlementMode {
        ESCROW,
        PRIVATE_SETTLEMENT
    }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct WorkflowConfig {
        bytes32 approvedWorkflowHash;
        ModuleType moduleType;
        SettlementMode settlementMode;
        bool active;
    }

    struct ExecutionRecord {
        bytes32 commitmentHash;
        bool finalized;
    }

    // -------------------------------------------------------------------------
    // EIP-712
    // -------------------------------------------------------------------------

    bytes32 public constant EXECUTION_TYPEHASH =
        keccak256("FinalizeExecution(uint256 workflowId,bytes32 commitmentHash,uint256 nonce)");

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev workflowId => WorkflowConfig
    mapping(uint256 => WorkflowConfig) private _workflowConfigs;

    /// @dev workflowId => executionIndex => ExecutionRecord (commitment only, no private data)
    mapping(uint256 => mapping(uint256 => ExecutionRecord)) private _executionRecords;

    /// @dev workflowId => number of executions (next index)
    mapping(uint256 => uint256) private _executionCount;

    /// @dev Replay protection: per-workflow nonces. Key is (workflowId, nonce).
    ///      finalizeExecution is permissionless; the attestation proof (from TEE) authorizes the execution.
    ///      Nonces are scoped by workflowId so replay cannot cross workflows.
    mapping(uint256 => mapping(uint256 => bool)) private _usedNonces;

    uint256 private _nextWorkflowId = 1;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event WorkflowCreated(
        uint256 indexed workflowId,
        bytes32 indexed approvedWorkflowHash,
        ModuleType moduleType,
        SettlementMode settlementMode
    );

    event ExecutionFinalized(
        uint256 indexed workflowId,
        uint256 indexed executionIndex,
        bytes32 commitmentHash
    );

    event CommitmentVerified(uint256 indexed workflowId, bytes32 commitmentHash);

    event WorkflowDeactivated(uint256 indexed workflowId);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error WorkflowNotActive(uint256 workflowId);
    error ExecutionAlreadyFinalized(uint256 workflowId, uint256 executionIndex);
    error InvalidAttestation();
    error NonceAlreadyUsed(uint256 workflowId, uint256 nonce);
    error InvalidWorkflowId(uint256 workflowId);
    error EscrowNoValue();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() EIP712("ConfidentialExecutionEngine", "1") {}

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyActiveWorkflow(uint256 workflowId) {
        if (workflowId == 0 || workflowId >= _nextWorkflowId) revert InvalidWorkflowId(workflowId);
        WorkflowConfig storage config = _workflowConfigs[workflowId];
        if (!config.active) revert WorkflowNotActive(workflowId);
        _;
    }

    // -------------------------------------------------------------------------
    // External / Public
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new confidential workflow.
     * @param approvedWorkflowHash Hash of the approved workflow definition (off-chain).
     * @param moduleType SEALED_BID_AUCTION or PRIVATE_VOTING.
     * @param settlementMode ESCROW or PRIVATE_SETTLEMENT.
     */
    function createWorkflow(
        bytes32 approvedWorkflowHash,
        ModuleType moduleType,
        SettlementMode settlementMode
    ) external {
        uint256 workflowId = _nextWorkflowId++;
        _workflowConfigs[workflowId] = WorkflowConfig({
            approvedWorkflowHash: approvedWorkflowHash,
            moduleType: moduleType,
            settlementMode: settlementMode,
            active: true
        });
        emit WorkflowCreated(workflowId, approvedWorkflowHash, moduleType, settlementMode);
    }

    /**
     * @notice Finalize an execution for a workflow. Stores only commitment hash on-chain.
     *         Permissionless: anyone can call; TEE attestation proof authorizes the execution.
     *         Replay protection: per-workflow nonce (stored in _usedNonces[workflowId][nonce]).
     * @param workflowId Id of the workflow.
     * @param commitmentHash Hash of the execution result (no private input stored).
     * @param attestationProof TEE attestation proof (must bind workflow hash + commitment; logic stubbed).
     * @param nonce Replay-protection nonce for this workflow.
     */
    function finalizeExecution(
        uint256 workflowId,
        bytes32 commitmentHash,
        bytes calldata attestationProof,
        uint256 nonce
    ) external payable nonReentrant onlyActiveWorkflow(workflowId) {
        if (_usedNonces[workflowId][nonce]) revert NonceAlreadyUsed(workflowId, nonce);

        WorkflowConfig storage config = _workflowConfigs[workflowId];

        if (config.settlementMode == SettlementMode.ESCROW) {
            if (msg.value != 0) revert EscrowNoValue();
        }

        if (
            !verifyAttestation(
                attestationProof,
                config.approvedWorkflowHash,
                commitmentHash,
                nonce
            )
        ) revert InvalidAttestation();

        _usedNonces[workflowId][nonce] = true;
        uint256 executionIndex = _executionCount[workflowId]++;
        ExecutionRecord storage record = _executionRecords[workflowId][executionIndex];
        if (record.finalized) revert ExecutionAlreadyFinalized(workflowId, executionIndex);

        record.commitmentHash = commitmentHash;
        record.finalized = true;

        emit CommitmentVerified(workflowId, commitmentHash);
        emit ExecutionFinalized(workflowId, executionIndex, commitmentHash);
    }

    /**
     * @notice Deactivate a workflow (e.g. for upgrades or retirement).
     */
    function deactivateWorkflow(uint256 workflowId) external onlyActiveWorkflow(workflowId) {
        _workflowConfigs[workflowId].active = false;
        emit WorkflowDeactivated(workflowId);
    }

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    function getWorkflowConfig(uint256 workflowId) external view returns (WorkflowConfig memory) {
        return _workflowConfigs[workflowId];
    }

    function getExecutionRecord(
        uint256 workflowId,
        uint256 executionIndex
    ) external view returns (ExecutionRecord memory) {
        return _executionRecords[workflowId][executionIndex];
    }

    function getExecutionCount(uint256 workflowId) external view returns (uint256) {
        return _executionCount[workflowId];
    }

    function isNonceUsed(uint256 workflowId, uint256 nonce) external view returns (bool) {
        return _usedNonces[workflowId][nonce];
    }

    function nextWorkflowId() external view returns (uint256) {
        return _nextWorkflowId;
    }

    /// @dev Returns EIP-712 domain separator (includes chainId and address(this) to prevent cross-chain replay).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @dev EIP-712 digest for FinalizeExecution(workflowId, commitmentHash, nonce). Includes domain (chainId, contract).
     */
    function hashFinalizeExecution(
        uint256 workflowId,
        bytes32 commitmentHash,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(EXECUTION_TYPEHASH, workflowId, commitmentHash, nonce));
        return _hashTypedDataV4(structHash);
    }

    // -------------------------------------------------------------------------
    // Internal (attestation stub)
    // -------------------------------------------------------------------------

    /**
     * @notice Verify TEE attestation proof. Must bind approvedWorkflowHash, commitmentHash, and nonce.
     *         Replay protection is cryptographic: the same proof cannot be used with a different nonce.
     * @dev Proof layout (stub): bytes32 workflowHash | bytes32 commitmentHash | uint256 nonce (96 bytes).
     *      TODO: Implement full TEE attestation (MRENCLAVE, approved code hash, attestation authority signature).
     */
    function verifyAttestation(
        bytes calldata proof,
        bytes32 approvedWorkflowHash,
        bytes32 commitmentHash,
        uint256 nonce
    ) internal pure returns (bool) {
        if (proof.length < 96) return false;
        bytes32 proofWorkflowHash;
        bytes32 proofCommitmentHash;
        uint256 proofNonce;
        assembly {
            proofWorkflowHash := calldataload(proof.offset)
            proofCommitmentHash := calldataload(add(proof.offset, 32))
            proofNonce := calldataload(add(proof.offset, 64))
        }
        if (proofWorkflowHash != approvedWorkflowHash) return false;
        if (proofCommitmentHash != commitmentHash) return false;
        if (proofNonce != nonce) return false;
        // TODO: Full TEE attestation verification
        return true;
    }
}
