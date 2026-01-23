// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISwapper {
    struct SwapParams {
        address assetToSwapToOrFrom;
        uint256 amountToSwapToOrFrom;
        address receiver;
        bytes[] updateData;
    }

    error ETHSentLessThanSwapPlusFee();
    error ETHSentLessThanFee();
    error OracleNotSet();
    error SwapperMustNotBeReceiver();
    error SwapOnlyToOtherTokens();
    error SwapOnlyToPrivateToken();
    error SwapOnSameBlockNumber();

    function getOracleUpdateFee(bytes[] calldata priceUpdate) external view returns (uint256);
    function swapToPrivateToken(SwapParams calldata swapParams) external payable;
    function swapFromPrivateToken(SwapParams calldata swapParams) external payable;
}