// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISilentERC20 } from "./token/ISilentERC20.sol";

address constant NATIVE_TOKEN = address(0);

abstract contract Fee {
    ISilentERC20 internal immutable SILENT_TOKEN;
    address internal immutable GUARDIAN_FEE_COLLECTOR = 0x1181a7eA6E0A4350b067B0BaCdf71440e70ef219;

    /// @notice 0.7% fee on every deposit, i.e 7 / 1000.
    uint8 private constant FEE_PERCENTAGE = 7;
    uint16 private constant FEE_PERCENTAGE_BASE = 1000;

    /// @notice 65% to the collector, the rest to the guardian.
    uint8 private constant COLLECTOR_PERCENTAGE = 65;
    uint8 private constant __GUARDIAN_PERCENTAGE__ = 35; // Unused.
    uint16 private constant COLLECTOR_PERCENTAGE_BASE = 100;

    address private constant COLLECTOR = 0x1181a7eA6E0A4350b067B0BaCdf71440e70ef219;

    constructor(address silentToken, address guardian) {
        SILENT_TOKEN = ISilentERC20(silentToken);
        GUARDIAN_FEE_COLLECTOR = guardian;
    }

    function _takeFee(uint256 amount) internal {
        _distributeFee(_calculateFee(amount));
    }

    function _calculateFee(uint256 amount) internal pure returns (uint256 fee) {
        fee = (amount * FEE_PERCENTAGE) / FEE_PERCENTAGE_BASE;
    }

    function _distributeFee(uint256 fee) private {
        uint256 collectorFee = (COLLECTOR_PERCENTAGE * fee) / COLLECTOR_PERCENTAGE_BASE;
        uint256 guardianFee = fee - collectorFee;

        SILENT_TOKEN.transfer(COLLECTOR, collectorFee);
        SILENT_TOKEN.transfer(GUARDIAN_FEE_COLLECTOR, guardianFee);
    }
}
