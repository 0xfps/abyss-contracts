// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SilentERC20 } from "../token/SilentERC20.sol";

// https://sepolia.arbiscan.io/address/0xe4a40523ceaBd35B73235741a82342FB420bc813
contract MockSilentERC20 is SilentERC20 {
    uint256 amount = 500_000e6;
    constructor(string memory name, string memory symbol)
       SilentERC20(name, symbol) {
        _mint(address(this), amount);
        _approve(address(this), msg.sender, amount);
        _transfer(address(this), msg.sender, amount);
    }
}

// https://sepolia.arbiscan.io/address/0x93B863Ea6680B4DCa821d61032768Bb6f75aCEC5
contract MockNonSilentERC20 is ERC20 {
    uint256 amount = 500_000e18;
    constructor(string memory name, string memory symbol)
       ERC20(name, symbol) {
        _mint(address(this), amount);
        _approve(address(this), msg.sender, amount);
        _transfer(address(this), msg.sender, amount);
    }
}