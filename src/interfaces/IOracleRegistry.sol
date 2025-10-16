// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IOracleRegistry {
    struct OracleParams {
        address asset;
        bytes32 priceFeedId;
    }

    function addAssetOracle(OracleParams memory oracleParams) external;
    function removeAssetOracle(address asset) external;
}