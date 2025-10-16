// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISwapper {
    struct SwapParams {
        address assetToSwapToOrFrom;
        uint256 amountToSwapToOrFrom;
    }

    function getOracleUpdateFee(bytes[] calldata priceUpdate) external view returns (uint256);
    function swapToPrivateToken(SwapParams memory swapParams) external;
    function swapFromPrivateToken(SwapParams memory swapParams) external;
}