// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IOracleRegistry } from "./interfaces/IOracleRegistry.sol";

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract OracleRegistry is IOracleRegistry {
    // MultiSig.
    address public owner;

    // address(0) is native token.
    mapping(address asset => bytes32 priceFeedId) internal priceFeeds;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address multiSigAddress, OracleParams[] memory oracleParams) {
        owner = multiSigAddress;
        
        uint256 length = oracleParams.length;
        
        for (uint256 i; i < length; i++) {
            _addAssetPriceFeed(oracleParams[i]);
        }
    }

    function getPriceFeed(address asset) public view returns (bytes32) {
        return priceFeeds[asset];
    }

    function addAssetPriceFeed(OracleParams memory oracleParams) public onlyOwner {
        _addAssetPriceFeed(oracleParams);
    }

    function removeAssetPriceFeed(address asset) public onlyOwner {
        if (priceFeeds[asset] != bytes32(0)) {
            priceFeeds[asset] = bytes32(0);
        }
    }

    function _addAssetPriceFeed(OracleParams memory oracleParams) internal {
        if (priceFeeds[oracleParams.asset] == bytes32(0)) {
            priceFeeds[oracleParams.asset] = oracleParams.priceFeedId;
        }
    }
}