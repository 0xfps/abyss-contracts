// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IOracleRegistry } from "./interfaces/IOracleRegistry.sol";
import { IPyth } from "./pyth/IPyth.sol";
import { ISwapper } from "./interfaces/ISwapper.sol";

import { NATIVE_TOKEN } from "./Fee.sol";
import { PythStructs } from "./pyth/PythStructs.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SilentERC20 } from "./token/SilentERC20.sol";

contract Swapper is ISwapper, SilentERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant AGE = 60;
    uint24 public constant DENOMINATION = 1_000_000;

    IOracleRegistry public immutable ORACLE_REGISTRY;
    IPyth public immutable PYTH;

    mapping(address stable => bool isStable) public chainStables;

    constructor(
        string memory name,
        string memory symbol,
        address registry,
        address pyth,
        address[] memory stables
    ) SilentERC20(name, symbol) {
        ORACLE_REGISTRY = IOracleRegistry(registry);
        PYTH = IPyth(pyth);

        for (uint8 i; i < stables.length; i++) {
            chainStables[stables[i]] = true;
        }
    }

    function getOracleUpdateFee(bytes[] calldata updateData) public view returns (uint256) {
        return PYTH.getUpdateFee(updateData);
    }

    function getPrice(bytes32 priceFeedId) public view returns (PythStructs.Price memory price) {
        price = PYTH.getPriceNoOlderThan(priceFeedId, AGE);
    }

    // Swap from asset to $SilUSD.
    function swapToPrivateToken(SwapParams calldata swapParams) public payable nonReentrant {
        address asset = swapParams.assetToSwapToOrFrom;
        uint256 amount = swapParams.amountToSwapToOrFrom;

        if (asset == address(this)) revert SwapOnlyToPrivateToken();
        if (swapParams.receiver == msg.sender) revert SwapperMustNotBeReceiver();
        
        uint256 amountToMint;
        uint256 feeUpdatePrice;

        if (asset != NATIVE_TOKEN) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }

        if (chainStables[asset]) {
            amountToMint = (amount * 10 ** decimals()) / (10 ** IERC20Metadata(asset).decimals());
        } else {
            bytes32 priceFeedId = _getAssetPriceFeedId(asset);
            if (priceFeedId == bytes32(0)) revert OracleNotSet();

            (uint256 priceExp, uint256 expo, uint256 fee) = _getAssetPriceData(swapParams.updateData, priceFeedId);
            feeUpdatePrice = fee;

            amountToMint = _calculateAmountToMint(swapParams, priceExp, expo);
        }

        uint256 balance;
        if (asset == NATIVE_TOKEN) {
            if (msg.value < (amount + feeUpdatePrice)) revert ETHSentLessThanSwapPlusFee();
            balance = msg.value - (amount + feeUpdatePrice);
        } else {
            balance = msg.value - feeUpdatePrice;
        }

        (bool sent, ) = msg.sender.call{ value: balance }("");
        require(sent);
        
        _mint(swapParams.receiver, amountToMint);
    }

    // Swap from $SilUSD to asset.
    function swapFromPrivateToken(SwapParams calldata swapParams) public payable nonReentrant {
        address asset = swapParams.assetToSwapToOrFrom;
        uint256 amount = swapParams.amountToSwapToOrFrom;

        if (asset == address(this)) revert SwapOnlyFromPrivateToken();
        if (swapParams.receiver == msg.sender) revert SwapperMustNotBeReceiver();

        _burn(msg.sender, amount);
        
        uint256 amountToPay;
        uint256 feeUpdatePrice;

        if (chainStables[asset]) {
            amountToPay = (amount * (10 ** IERC20Metadata(asset).decimals())) / (10 ** decimals());
        } else {
            bytes32 priceFeedId = _getAssetPriceFeedId(asset);
            if (priceFeedId == bytes32(0)) revert OracleNotSet();

            (uint256 priceExp, uint256 expo, uint256 fee) = _getAssetPriceData(swapParams.updateData, priceFeedId);
            feeUpdatePrice = fee;

            amountToPay = _calculateAmountToPay(swapParams, priceExp, expo);
        }

        uint256 balance;
        if (asset == NATIVE_TOKEN) {
            if (msg.value < feeUpdatePrice) revert ETHSentLessThanFee();
            balance = (msg.value + amountToPay) - feeUpdatePrice;
        } else {
            balance = msg.value - feeUpdatePrice;
            IERC20(asset).safeTransferFrom(address(this), swapParams.receiver, amountToPay);
        }

        (bool sent, ) = msg.sender.call{ value: balance }("");
        require(sent);
    }

    function _getAssetPriceFeedId(address asset) internal view returns (bytes32) {
        return ORACLE_REGISTRY.getPriceFeed(asset);
    }

    function _getAssetPriceData(
        bytes[] calldata updateData,
        bytes32 priceFeedId
    ) internal returns (uint256 priceExp, uint256 expo, uint256 feeUpdatePrice) {
        feeUpdatePrice = getOracleUpdateFee(updateData);

        PYTH.updatePriceFeeds{ value: feeUpdatePrice }(updateData);

        PythStructs.Price memory price = PYTH.getPriceNoOlderThan(priceFeedId, AGE);

        priceExp = uint256(int256(price.price));
        expo = uint64(_abs(price.expo));
    }

    function _calculateAmountToMint(
        SwapParams calldata swapParams,
        uint256 priceExp,
        uint256 expo
    ) internal view returns (uint256) {
        uint8 decimal = swapParams.assetToSwapToOrFrom == NATIVE_TOKEN
            ? 18 
            : IERC20Metadata(swapParams.assetToSwapToOrFrom).decimals();

        uint256 receiveExpo = (swapParams.amountToSwapToOrFrom * priceExp) / (10 ** decimal);
        uint256 mintAmount = (receiveExpo * (10 ** decimals())) / (10 ** expo);
        return mintAmount;
    }

    function _calculateAmountToPay(
        SwapParams calldata swapParams,
        uint256 priceExp,
        uint256 expo
    ) internal view returns (uint256) {
        uint8 decimal = swapParams.assetToSwapToOrFrom == NATIVE_TOKEN
            ? 18 
            : IERC20Metadata(swapParams.assetToSwapToOrFrom).decimals();

        uint256 backToExp = (swapParams.amountToSwapToOrFrom * (10 ** expo)) / (10 ** decimals());
        uint256 amountToPay = ((10 ** decimal) * backToExp) / priceExp;
        return amountToPay;
    }

    function _abs(int32 num) internal pure returns (uint256) {
        return (num < 0) ? uint256(int256(-1 * num)) : uint256(int256(num));
    }
}