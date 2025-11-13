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
        _addAssetPriceFeeds(oracleParams);
    }

    function getPriceFeed(address asset) public view returns (bytes32) {
        return priceFeeds[asset];
    }

    function addAssetPriceFeeds(OracleParams[] memory oracleParams) public onlyOwner {
        _addAssetPriceFeeds(oracleParams);
    }

    function removeAssetPriceFeeds(address[] memory assets) public onlyOwner {
        uint256 length = assets.length;
        
        for (uint256 i; i < length; i++) {
            if (priceFeeds[assets[i]] != bytes32(0)) {
                priceFeeds[assets[i]] = bytes32(0);
            }
        }
    }

    function _addAssetPriceFeeds(OracleParams[] memory oracleParams) internal {
        uint256 length = oracleParams.length;

        for (uint256 i; i < length; i++) {
            if (priceFeeds[oracleParams[i].asset] == bytes32(0)) {
                priceFeeds[oracleParams[i].asset] = oracleParams[i].priceFeedId;
            }
        }
    }
}