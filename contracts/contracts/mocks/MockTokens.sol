// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Test-only tokens. MockStable behaves like USDC; MockUSDT returns nothing, like real USDT.
contract MockStable {
    string public name; string public symbol; uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory n, string memory s) { name = n; symbol = s; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance"); allowance[f][msg.sender] -= a; _move(f, to, a); return true;
    }
    function _move(address f, address t, uint256 a) internal { require(balanceOf[f] >= a, "balance"); balanceOf[f] -= a; balanceOf[t] += a; }
}

contract MockUSDT {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external { allowance[msg.sender][s] = a; }
    function transfer(address to, uint256 a) external { _move(msg.sender, to, a); }
    function transferFrom(address f, address to, uint256 a) external {
        require(allowance[f][msg.sender] >= a, "allowance"); allowance[f][msg.sender] -= a; _move(f, to, a);
    }
    function _move(address f, address t, uint256 a) internal { require(balanceOf[f] >= a, "balance"); balanceOf[f] -= a; balanceOf[t] += a; }
}
