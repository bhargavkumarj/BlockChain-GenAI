// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The subset of Foundry cheatcodes the suite uses. Signatures match Foundry's `Vm` interface;
///      kept in-repo so tests have no external code dependencies beyond OpenZeppelin.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function deal(address account, uint256 newBalance) external;
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit() external;
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function label(address account, string calldata newLabel) external;
    function assume(bool condition) external pure;
    function assertTrue(bool condition, string calldata error) external pure;
    function assertFalse(bool condition, string calldata error) external pure;
    function assertEq(uint256 left, uint256 right, string calldata error) external pure;
    function assertEq(address left, address right, string calldata error) external pure;
    function assertEq(bool left, bool right, string calldata error) external pure;
    function assertEq(string calldata left, string calldata right, string calldata error) external pure;
    function assertEq(bytes32 left, bytes32 right, string calldata error) external pure;
    function assertLe(uint256 left, uint256 right, string calldata error) external pure;
}

/// @dev Minimal test base: cheatcodes, a `bound` helper and invariant target registration.
abstract contract Harness {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bool public IS_TEST = true;

    address[] private _targets;

    function targetContracts() public view returns (address[] memory) {
        return _targets;
    }

    function targetContract(address target) internal {
        _targets.push(target);
    }

    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(min <= max, "bound: min > max");
        uint256 size = max - min + 1;
        if (size == 0) return x; // full uint256 range
        return min + (x % size);
    }

    function makeAddr(string memory name, uint256 key) internal returns (address account) {
        account = vm.addr(key);
        vm.label(account, name);
    }
}
