// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IOracleRegistry {
    struct OracleParams {
        address asset;
        bytes32 priceFeedId;
    }

    error NotOwner();

    function getPriceFeed(address asset) external view returns (bytes32);

    function addAssetPriceFeed(OracleParams memory oracleParams) external;
    function removeAssetPriceFeed(address asset) external;
}