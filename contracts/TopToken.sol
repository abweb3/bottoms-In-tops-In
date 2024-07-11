// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TopToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Top Token", "TOP") Ownable(initialOwner) {
        _mint(msg.sender, 69420000 * 10**18); // 69.42 million tokens
    }
}
