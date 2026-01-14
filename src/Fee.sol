// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISilentERC20 } from "./token/ISilentERC20.sol";

address constant NATIVE_TOKEN = address(0);

abstract contract Fee {
    ISilentERC20 internal immutable SILENT_TOKEN;

    /// @notice 1%, unused, but for informational purposes.
    uint8 private constant FEE_PERCENTAGE = 1;
    uint8 private constant PERCENTAGE_BASE = 100;

    address private constant COLLECTOR = 0x1181a7eA6E0A4350b067B0BaCdf71440e70ef219;

    constructor(address silentToken) {
        SILENT_TOKEN = ISilentERC20(silentToken);
    }

    function _takeFee(uint256 amount) internal {
        _distributeFee(_calculateFee(amount));
    }

    function _calculateFee(uint256 amount) internal pure returns (uint256 fee) {
        fee = amount / PERCENTAGE_BASE;
    }

    function _distributeFee(uint256 fee) private {
        SILENT_TOKEN.transfer(COLLECTOR, fee);
    }
}