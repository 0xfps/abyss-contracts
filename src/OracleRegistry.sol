// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IOracleRegistry } from "./interfaces/IOracleRegistry.sol";

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract OracleRegistry is IOracleRegistry, Ownable2Step {
    bool public isOwnedByMultiSig;

    // address(0) is native token.
    mapping(address asset => bytes32 priceFeedId) public priceFeeds;

    // Address deploying the registry.
    // This will be transferred to a multisig.
    constructor(address initialOwner) Ownable(initialOwner) {}

    function transferToMultiSig(address multiSigAddress) public onlyOwner {
        if (!isOwnedByMultiSig) {
            address currentOwner = owner();

            isOwnedByMultiSig = true;
            _transferOwnership(multiSigAddress);

            emit OwnershipTransferredToMultisig(currentOwner, multiSigAddress);
        }
    }

    function getPriceFeed(address asset) public view returns (bytes32) {
        return priceFeeds[asset];
    }

    function addAssetOracle(OracleParams memory oracleParams) public onlyOwner {
        if (priceFeeds[oracleParams.asset] == bytes32(0)) {
            priceFeeds[oracleParams.asset] = oracleParams.priceFeedId;
        }
    }

    function removeAssetOracle(address asset) public onlyOwner {
        if (priceFeeds[asset] != bytes32(0)) {
            priceFeeds[asset] = bytes32(0);
        }
    }
}