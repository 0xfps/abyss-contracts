// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { NATIVE_TOKEN } from "./Fee.sol";

abstract contract Recorder {
    mapping(uint256 nullifier => bool used) internal nullifierUsed;
    mapping(bytes32 leaf => bool inUse) public leaves;
    mapping(uint256 amount => uint256 depositCount) public depositCountForAmount;
    mapping(uint256 amount => uint256 depositCount) public withdrawalCountForAmount;
    mapping(bytes withdrawalKey => uint256 amountWithdrawn) public withdrawals;

    function _leafExists(bytes32 leaf) internal view returns (bool) {
        return leaves[leaf];
    }

    function _recordDeposit(bytes32 standardizedKey) internal {
        leaves[standardizedKey] = true;
    }
}