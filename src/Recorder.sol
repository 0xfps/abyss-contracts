// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { NATIVE_TOKEN } from "./Fee.sol";

abstract contract Recorder {
    mapping(bytes32 leaf => bool inUse) internal leaves;
    mapping(uint256 nullifier => bool used) internal nullifierUsed;
    mapping(bytes withdrawalKeyHash => uint256 amountWithdrawn) public withdrawals;
    mapping(bytes withdrawalKeyHash => mapping(uint256 slot => uint256 amountWithdrawn)) public withdrawalSlots;

    function _leafExists(bytes32 leaf) internal view returns (bool) {
        return leaves[leaf];
    }

    function _recordDeposit(bytes32 standardizedKey) internal {
        leaves[standardizedKey] = true;
    }
}