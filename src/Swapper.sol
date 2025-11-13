// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IOracleRegistry } from "./interfaces/IOracleRegistry.sol";
import { IPyth } from "./pyth/IPyth.sol";
import { ISwapper } from "./interfaces/ISwapper.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { NATIVE_TOKEN } from "./Fee.sol";
import { PythStructs } from "./pyth/PythStructs.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SilentERC20 } from "./token/SilentERC20.sol";

contract Swapper is ISwapper, SilentERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant AGE = 90;
    uint24 public constant DENOMINATION = 1_000_000;

    IOracleRegistry public immutable ORACLE_REGISTRY;
    IPyth public immutable PYTH;

    constructor(
        string memory name,
        string memory symbol,
        address registry,
        address pyth
    ) SilentERC20(name, symbol) {
        ORACLE_REGISTRY = IOracleRegistry(registry);
        PYTH = IPyth(pyth);
    }

    receive() external payable {}

    function getOracleUpdateFee(bytes[] calldata updateData) public view returns (uint256) {
        return PYTH.getUpdateFee(updateData);
    }

    // Swap from asset to $SilUSD.
    function swapToPrivateToken(SwapParams calldata swapParams) public payable nonReentrant {
        address asset = swapParams.assetToSwapToOrFrom;
        uint256 amount = swapParams.amountToSwapToOrFrom;

        if (asset == address(this)) revert SwapOnlyToPrivateToken();

        if (asset != NATIVE_TOKEN) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }

        bytes32 priceFeedId = _getAssetPriceFeedId(asset);
        if (priceFeedId == bytes32(0)) revert OracleNotSet();

        (uint256 priceExp, uint256 expo, uint256 fee) = _getAssetPriceData(swapParams.updateData, priceFeedId);
        uint256 feeUpdatePrice = fee;

        uint256 amountToMint = _calculateAmountToMint(swapParams, priceExp, expo);

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

        if (asset == address(this)) revert SwapOnlyToOtherTokens();

        _burn(msg.sender, amount);

        bytes32 priceFeedId = _getAssetPriceFeedId(asset);
        if (priceFeedId == bytes32(0)) revert OracleNotSet();

        (uint256 priceExp, uint256 expo, uint256 fee) = _getAssetPriceData(swapParams.updateData, priceFeedId);
        uint256 feeUpdatePrice = fee;

        uint256 amountToPay = _calculateAmountToPay(swapParams, priceExp, expo);

        uint256 balance;
        if (asset == NATIVE_TOKEN) {
            if (msg.value < feeUpdatePrice) revert ETHSentLessThanFee();
            balance = (msg.value + amountToPay) - feeUpdatePrice;
        } else {
            balance = msg.value - feeUpdatePrice;
            IERC20(asset).safeTransfer(swapParams.receiver, amountToPay);
        }

        (bool sent, ) = swapParams.receiver.call{ value: balance }("");
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