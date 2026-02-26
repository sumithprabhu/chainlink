// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../contracts/ConfidentialExecutionEngine.sol";

contract ConfidentialExecutionEngineTest is Test {
    ConfidentialExecutionEngine public engine;

    address public owner;
    address public user1;
    address public user2;

    bytes32 constant APPROVED_HASH = keccak256("approved-workflow-v1");
    bytes32 constant COMMITMENT = keccak256("execution-commitment-1");

    /// @dev Stub attestation: workflowHash (32) | commitmentHash (32) | nonce (32) = 96 bytes. Binds nonce for replay protection.
    function _stubAttestation(bytes32 workflowHash, bytes32 commitment, uint256 nonce) internal pure returns (bytes memory) {
        return abi.encodePacked(workflowHash, commitment, nonce);
    }

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        engine = new ConfidentialExecutionEngine();
    }

    // -------------------------------------------------------------------------
    // Workflow creation
    // -------------------------------------------------------------------------

    function test_CreateWorkflow_EmitsWorkflowCreated() public {
        vm.expectEmit(true, true, true, true);
        emit ConfidentialExecutionEngine.WorkflowCreated(
            1,
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
    }

    function test_CreateWorkflow_StoresConfig() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.PRIVATE_VOTING,
            ConfidentialExecutionEngine.SettlementMode.PRIVATE_SETTLEMENT
        );
        ConfidentialExecutionEngine.WorkflowConfig memory config = engine.getWorkflowConfig(1);
        assertEq(config.approvedWorkflowHash, APPROVED_HASH);
        assertEq(
            uint256(config.moduleType),
            uint256(ConfidentialExecutionEngine.ModuleType.PRIVATE_VOTING)
        );
        assertEq(
            uint256(config.settlementMode),
            uint256(ConfidentialExecutionEngine.SettlementMode.PRIVATE_SETTLEMENT)
        );
        assertTrue(config.active);
    }

    function test_CreateWorkflow_IncrementsWorkflowId() public {
        assertEq(engine.nextWorkflowId(), 1);
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        assertEq(engine.nextWorkflowId(), 2);
        engine.createWorkflow(
            keccak256("other"),
            ConfidentialExecutionEngine.ModuleType.PRIVATE_VOTING,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        assertEq(engine.nextWorkflowId(), 3);
    }

    // -------------------------------------------------------------------------
    // Settlement mode storage
    // -------------------------------------------------------------------------

    function test_SettlementMode_ESCROW_Stored() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        ConfidentialExecutionEngine.WorkflowConfig memory config = engine.getWorkflowConfig(1);
        assertEq(
            uint256(config.settlementMode),
            uint256(ConfidentialExecutionEngine.SettlementMode.ESCROW)
        );
    }

    function test_SettlementMode_PRIVATE_SETTLEMENT_Stored() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.PRIVATE_VOTING,
            ConfidentialExecutionEngine.SettlementMode.PRIVATE_SETTLEMENT
        );
        ConfidentialExecutionEngine.WorkflowConfig memory config = engine.getWorkflowConfig(1);
        assertEq(
            uint256(config.settlementMode),
            uint256(ConfidentialExecutionEngine.SettlementMode.PRIVATE_SETTLEMENT)
        );
    }

    // -------------------------------------------------------------------------
    // Commitment storage (only hash on-chain, no private data)
    // -------------------------------------------------------------------------

    function test_FinalizeExecution_StoresCommitmentHashOnly() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
        ConfidentialExecutionEngine.ExecutionRecord memory record =
            engine.getExecutionRecord(1, 0);
        assertEq(record.commitmentHash, COMMITMENT);
        assertTrue(record.finalized);
    }

    function test_FinalizeExecution_EmitsExecutionFinalized() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        vm.expectEmit(true, true, true, true);
        emit ConfidentialExecutionEngine.ExecutionFinalized(1, 0, COMMITMENT);
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
    }

    function test_FinalizeExecution_IncrementsExecutionCount() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        assertEq(engine.getExecutionCount(1), 0);
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
        assertEq(engine.getExecutionCount(1), 1);
        engine.finalizeExecution(1, keccak256("commit2"), _stubAttestation(APPROVED_HASH, keccak256("commit2"), 1), 1);
        assertEq(engine.getExecutionCount(1), 2);
    }

    // -------------------------------------------------------------------------
    // Replay protection
    // -------------------------------------------------------------------------

    function test_ReplayProtection_RejectsReusedNonce() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 42), 42);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConfidentialExecutionEngine.NonceAlreadyUsed.selector,
                1,
                42
            )
        );
        engine.finalizeExecution(1, keccak256("other"), _stubAttestation(APPROVED_HASH, COMMITMENT, 42), 42);
    }

    function test_ReplayProtection_DifferentNoncesSucceed() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
        engine.finalizeExecution(1, keccak256("c2"), _stubAttestation(APPROVED_HASH, keccak256("c2"), 1), 1);
        assertTrue(engine.isNonceUsed(1, 0));
        assertTrue(engine.isNonceUsed(1, 1));
    }

    function test_ReplayProtection_EmptyAttestationReverts() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        vm.expectRevert(ConfidentialExecutionEngine.InvalidAttestation.selector);
        engine.finalizeExecution(1, COMMITMENT, "", 0); // empty proof
    }

    /// @dev Same proof cannot be used with different nonce (nonce is bound in attestation).
    function test_ReplayProtection_ProofBoundNonce_DifferentNonceReverts() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        bytes memory proofForNonce0 = _stubAttestation(APPROVED_HASH, COMMITMENT, 0);
        engine.finalizeExecution(1, COMMITMENT, proofForNonce0, 0);
        vm.expectRevert(ConfidentialExecutionEngine.InvalidAttestation.selector);
        engine.finalizeExecution(1, COMMITMENT, proofForNonce0, 1);
    }

    /// @dev Finalize with attestation built for a different workflow must fail (proof binds workflow hash).
    function test_FinalizeWithWrongWorkflowHashFails() public {
        bytes32 hash1 = keccak256("workflow-1");
        bytes32 hash2 = keccak256("workflow-2");
        engine.createWorkflow(
            hash1,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.createWorkflow(
            hash2,
            ConfidentialExecutionEngine.ModuleType.PRIVATE_VOTING,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        bytes memory proofForWorkflow1 = _stubAttestation(hash1, COMMITMENT, 0);
        vm.expectRevert(ConfidentialExecutionEngine.InvalidAttestation.selector);
        engine.finalizeExecution(2, COMMITMENT, proofForWorkflow1, 0);
    }

    function test_EscrowMode_RejectsValue() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        vm.expectRevert(ConfidentialExecutionEngine.EscrowNoValue.selector);
        engine.finalizeExecution{value: 1 ether}(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
    }

    function test_EmitsCommitmentVerified() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        vm.expectEmit(true, true, true, true);
        emit ConfidentialExecutionEngine.CommitmentVerified(1, COMMITMENT);
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
    }

    // -------------------------------------------------------------------------
    // Workflow isolation and active check
    // -------------------------------------------------------------------------

    function test_OnlyActiveWorkflow_RevertsWhenDeactivated() public {
        engine.createWorkflow(
            APPROVED_HASH,
            ConfidentialExecutionEngine.ModuleType.SEALED_BID_AUCTION,
            ConfidentialExecutionEngine.SettlementMode.ESCROW
        );
        engine.deactivateWorkflow(1);
        vm.expectRevert(
            abi.encodeWithSelector(ConfidentialExecutionEngine.WorkflowNotActive.selector, 1)
        );
        engine.finalizeExecution(1, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
    }

    function test_InvalidWorkflowId_Reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(ConfidentialExecutionEngine.InvalidWorkflowId.selector, 0)
        );
        engine.finalizeExecution(0, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
        vm.expectRevert(
            abi.encodeWithSelector(ConfidentialExecutionEngine.InvalidWorkflowId.selector, 999)
        );
        engine.finalizeExecution(999, COMMITMENT, _stubAttestation(APPROVED_HASH, COMMITMENT, 0), 0);
    }

    // -------------------------------------------------------------------------
    // EIP-712 (scaffold)
    // -------------------------------------------------------------------------

    function test_DomainSeparator_IsSet() public view {
        assertNotEq(engine.domainSeparator(), bytes32(0));
    }

    function test_HashFinalizeExecution_Deterministic() public view {
        bytes32 h1 = engine.hashFinalizeExecution(1, COMMITMENT, 0);
        bytes32 h2 = engine.hashFinalizeExecution(1, COMMITMENT, 0);
        assertEq(h1, h2);
    }
}
