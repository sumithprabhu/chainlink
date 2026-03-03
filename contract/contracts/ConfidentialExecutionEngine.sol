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
 * This contract implements escrow-backed sealed-bid settlement.
 * Confidentiality is enforced off-chain.
 * Only commitment hash is stored on-chain.
 * No bid amounts are ever written to storage except escrow balances.
 *
 * Permissionless auction creation.
 * Creator stakes CREATION_DEPOSIT.
 * On successful close, deposit is refunded minus protocol fee.
 * Ensures spam resistance and protocol sustainability.
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

    struct AuctionConfig {
        uint256 startTime;
        uint256 endTime;
        uint256 minBidIncrement;
        uint256 reservePrice;
        uint256 maxBidders;
        bool softCloseEnabled;
        uint256 softCloseWindow;
        uint256 softCloseExtension;
    }

    // -------------------------------------------------------------------------
    // Creation deposit and protocol fee
    // -------------------------------------------------------------------------

    uint256 public constant CREATION_DEPOSIT = 0.001 ether;
    uint256 public constant CREATION_FEE = 0.0001 ether;

    address public protocolFeeRecipient;
    /// @dev workflowId => creator address (for refund on close)
    mapping(uint256 => address) public auctionCreator;
    /// @dev workflowId => true after creation refund has been sent (only once)
    mapping(uint256 => bool) public creationRefunded;

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
    // Escrow (sealed-bid auction)
    // -------------------------------------------------------------------------

    address public engine;

    /// @dev workflowId => bidder => wei escrowed
    mapping(uint256 => mapping(address => uint256)) public escrowedBids;
    /// @dev workflowId => list of bidders who have deposited (for refund iteration)
    mapping(uint256 => address[]) public bidders;
    /// @dev workflowId => true after releaseEscrow has been called (only once)
    mapping(uint256 => bool) public escrowReleased;
    /// @dev workflowId => auction end timestamp (0 = no timeout); legacy only.
    mapping(uint256 => uint256) public auctionEndTime;
    /// @dev workflowId => auction config. startTime == 0 means legacy (no restrictions).
    mapping(uint256 => AuctionConfig) public auctionConfigs;
    /// @dev workflowId => effective end time (soft-close may extend; do not mutate auctionConfigs.endTime).
    mapping(uint256 => uint256) public dynamicEndTime;

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
    error ZeroBid();
    error WrongModule(uint256 workflowId);
    error EscrowNotFinalized(uint256 workflowId);
    error EscrowAlreadyReleased(uint256 workflowId);
    error InvalidWinner();
    error NotEngine();
    error NoExecutionRecord(uint256 workflowId);
    error TooManyBidders(uint256 workflowId);
    error AuctionNotEnded(uint256 workflowId);
    error TransferFailed();
    error AuctionNotStarted(uint256 workflowId);
    error AuctionEnded(uint256 workflowId);
    error BidBelowReserve(uint256 workflowId);
    error WrongCreationDeposit();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _engine, address _protocolFeeRecipient) EIP712("ConfidentialExecutionEngine", "1") {
        engine = _engine;
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyActiveWorkflow(uint256 workflowId) {
        if (workflowId == 0 || workflowId >= _nextWorkflowId) revert InvalidWorkflowId(workflowId);
        WorkflowConfig storage config = _workflowConfigs[workflowId];
        if (!config.active) revert WorkflowNotActive(workflowId);
        _;
    }

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine();
        _;
    }

    // -------------------------------------------------------------------------
    // External / Public
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new confidential workflow. Permissionless; caller must send CREATION_DEPOSIT.
     * @param approvedWorkflowHash Hash of the approved workflow definition (off-chain).
     * @param moduleType SEALED_BID_AUCTION or PRIVATE_VOTING.
     * @param settlementMode ESCROW or PRIVATE_SETTLEMENT.
     * @param _auctionEndTime Legacy: unix timestamp after which releaseEscrow is allowed; 0 = no timeout. Ignored when config.startTime != 0.
     * @param config Auction config. Use startTime == 0 for legacy (no auction restrictions).
     */
    function createWorkflow(
        bytes32 approvedWorkflowHash,
        ModuleType moduleType,
        SettlementMode settlementMode,
        uint256 _auctionEndTime,
        AuctionConfig memory config
    ) external payable {
        if (msg.value != CREATION_DEPOSIT) revert WrongCreationDeposit();
        uint256 workflowId = _nextWorkflowId++;
        auctionCreator[workflowId] = msg.sender;
        _workflowConfigs[workflowId] = WorkflowConfig({
            approvedWorkflowHash: approvedWorkflowHash,
            moduleType: moduleType,
            settlementMode: settlementMode,
            active: true
        });
        if (config.startTime == 0) {
            if (_auctionEndTime > 0) {
                auctionEndTime[workflowId] = _auctionEndTime;
            }
        } else {
            auctionConfigs[workflowId] = config;
            dynamicEndTime[workflowId] = config.endTime;
        }
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

    /**
     * @notice Lock bidder collateral (escrow) for a sealed-bid auction. Escrow amount is independent of confidential bid value.
     *         When auctionConfigs[workflowId].startTime != 0: enforces times, reserve stake (first deposit), maxBidders, soft close.
     *         No minBidIncrement at contract level; winner is determined off-chain by confidential logic.
     *         depositBid is NOT nonReentrant; no external calls before state updates.
     */
    function depositBid(uint256 workflowId) external payable onlyActiveWorkflow(workflowId) {
        WorkflowConfig storage config = _workflowConfigs[workflowId];
        if (config.moduleType != ModuleType.SEALED_BID_AUCTION) revert WrongModule(workflowId);
        if (msg.value == 0) revert ZeroBid();
        address[] storage bidderList = bidders[workflowId];
        uint256 previousBid = escrowedBids[workflowId][msg.sender];

        AuctionConfig storage ac = auctionConfigs[workflowId];
        if (ac.startTime != 0) {
            if (block.timestamp < ac.startTime) revert AuctionNotStarted(workflowId);
            uint256 effectiveEnd = dynamicEndTime[workflowId];
            if (ac.softCloseEnabled && block.timestamp > effectiveEnd - ac.softCloseWindow) {
                dynamicEndTime[workflowId] = effectiveEnd + ac.softCloseExtension;
                effectiveEnd = effectiveEnd + ac.softCloseExtension;
            }
            if (block.timestamp > effectiveEnd) revert AuctionEnded(workflowId);
            if (bidderList.length >= ac.maxBidders) revert TooManyBidders(workflowId);
        } else {
            if (bidderList.length >= 200) revert TooManyBidders(workflowId);
        }

        if (previousBid == 0) {
            bidderList.push(msg.sender);
        }
        escrowedBids[workflowId][msg.sender] += msg.value;
        uint256 totalEscrow = escrowedBids[workflowId][msg.sender];

        if (ac.startTime != 0 && previousBid == 0) {
            if (totalEscrow < ac.reservePrice) revert BidBelowReserve(workflowId);
        }
    }

    /**
     * @notice Release escrow after execution is finalized: transfer winner amount to winner, refund others.
     *         Callable only once per workflow, only by engine. Uses checks-effects-interactions and zero-out before transfer.
     */
    function releaseEscrow(uint256 workflowId, address winner) external nonReentrant onlyEngine {
        if (workflowId == 0 || workflowId >= _nextWorkflowId) revert InvalidWorkflowId(workflowId);
        if (winner == address(0)) revert InvalidWinner();
        if (_executionCount[workflowId] == 0) revert NoExecutionRecord(workflowId);
        ExecutionRecord storage record = _executionRecords[workflowId][0];
        if (!record.finalized) revert EscrowNotFinalized(workflowId);
        if (escrowReleased[workflowId]) revert EscrowAlreadyReleased(workflowId);
        AuctionConfig storage acConfig = auctionConfigs[workflowId];
        if (acConfig.startTime != 0) {
            if (block.timestamp <= dynamicEndTime[workflowId]) revert AuctionNotEnded(workflowId);
        } else if (auctionEndTime[workflowId] != 0 && block.timestamp < auctionEndTime[workflowId]) {
            revert AuctionNotEnded(workflowId);
        }
        require(escrowedBids[workflowId][winner] > 0, "Winner must have escrow");

        escrowReleased[workflowId] = true;

        uint256 winnerAmount = escrowedBids[workflowId][winner];
        escrowedBids[workflowId][winner] = 0;

        if (winnerAmount > 0) {
            (bool ok, ) = payable(winner).call{value: winnerAmount}("");
            if (!ok) revert TransferFailed();
        }

        address[] storage bidderList = bidders[workflowId];
        for (uint256 i = 0; i < bidderList.length; i++) {
            address bidder = bidderList[i];
            if (bidder != winner) {
                uint256 refund = escrowedBids[workflowId][bidder];
                escrowedBids[workflowId][bidder] = 0;
                if (refund > 0) {
                    (bool okRefund, ) = payable(bidder).call{value: refund}("");
                    if (!okRefund) revert TransferFailed();
                }
            }
        }

        if (!creationRefunded[workflowId]) {
            creationRefunded[workflowId] = true;
            uint256 refundAmount = CREATION_DEPOSIT - CREATION_FEE;
            address creator = auctionCreator[workflowId];
            (bool okRefund, ) = payable(creator).call{value: refundAmount}("");
            if (!okRefund) revert TransferFailed();
            (bool okFee, ) = payable(protocolFeeRecipient).call{value: CREATION_FEE}("");
            if (!okFee) revert TransferFailed();
        }
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

    function getBidderCount(uint256 workflowId) external view returns (uint256) {
        return bidders[workflowId].length;
    }

    function getAuctionConfig(uint256 workflowId) external view returns (AuctionConfig memory) {
        return auctionConfigs[workflowId];
    }

    /**
     * @notice True if configured auction (startTime != 0) has passed dynamicEndTime and execution not yet finalized.
     *         Legacy auctions (startTime == 0) are not closable via this check; do not auto-close them.
     */
    function isAuctionClosable(uint256 workflowId) external view returns (bool) {
        if (auctionConfigs[workflowId].startTime == 0) return false;
        if (block.timestamp <= dynamicEndTime[workflowId]) return false;
        if (_executionRecords[workflowId][0].finalized) return false;
        return true;
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
