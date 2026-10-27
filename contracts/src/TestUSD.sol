// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title TestUSD — a 6-decimal, EIP-2612 testnet dollar with a public faucet
/// @notice Lets anyone try Pactum end to end without real money. Mirrors USDC's decimals and permit support.
contract TestUSD is ERC20, ERC20Permit {
    uint256 public constant DRIP = 1_000e6;
    uint256 public constant COOLDOWN = 1 hours;

    mapping(address account => uint256) public lastDrip;

    error CoolingDown(uint256 availableAt);

    constructor() ERC20("Test USD", "tUSD") ERC20Permit("Test USD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint {DRIP} to `to`, at most once per {COOLDOWN}. Anyone may call it for anyone (relayer friendly).
    function faucet(address to) external {
        uint256 availableAt = lastDrip[to] + COOLDOWN;
        if (lastDrip[to] != 0 && block.timestamp < availableAt) revert CoolingDown(availableAt);
        lastDrip[to] = block.timestamp;
        _mint(to, DRIP);
    }
}
