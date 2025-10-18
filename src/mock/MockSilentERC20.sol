// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SilentERC20 } from "../token/SilentERC20.sol";

contract MockSilentERC20 is SilentERC20 {
    uint256 amount = 500_000e18;
    constructor(string memory name, string memory symbol)
       SilentERC20(name, symbol) {
        _mint(address(this), amount);
        _approve(address(this), msg.sender, amount);
        _transfer(address(this), msg.sender, amount);
    }
}

contract MockNonSilentERC20 is ERC20 {
    uint256 amount = 500_000e18;
    constructor(string memory name, string memory symbol)
       ERC20(name, symbol) {
        _mint(address(this), amount);
        _approve(address(this), msg.sender, amount);
        _transfer(address(this), msg.sender, amount);
    }
}