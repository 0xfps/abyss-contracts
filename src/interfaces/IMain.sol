// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMain {
    event DepositAdded(bytes32 indexed leaf);

    error ETHSentLessThanDeposit(uint256 ethSent, uint256 deposit);
    error KeyAlreadyUsed(bytes32 leaf);
    error NullifierUsed(uint256 nullifier);
    error ProofNotVerified();
    error RootNotInHistory(bytes32 root);
    error WithdrawalExceedsMax(uint256 withdrawal);

    function deposit(bytes calldata depositKey) external;

    function withdraw(
        bytes32 root,
        bytes calldata withdrawalKey,
        uint256[2] calldata pA,     // Proof.
        uint256[2][2] calldata pB,  // Proof.
        uint256[2] calldata pC,     // Proof.
        uint256 nullifier,
        address receipient,
        uint256 amount
    ) external;
}