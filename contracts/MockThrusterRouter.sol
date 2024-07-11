// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockThrusterRouter {
    uint256 public amountA;
    uint256 public amountB;
    uint256 public liquidity;

    function setReturnValues(uint256 _amountA, uint256 _amountB, uint256 _liquidity) external {
        amountA = _amountA;
        amountB = _amountB;
        liquidity = _liquidity;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint _amountA, uint _amountB, uint _liquidity) {
        return (amountA, amountB, liquidity);
    }
}