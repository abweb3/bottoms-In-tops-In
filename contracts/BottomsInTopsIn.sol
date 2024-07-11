// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IThrusterRouter {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}

contract BottomsInTopsIn is Ownable, ReentrancyGuard {
    using Checkpoints for Checkpoints.Trace224;
    using SafeERC20 for IERC20;

    IERC20 public immutable bottomToken;
    IERC20 public immutable topToken;
    address public immutable thrusterRouter;

    uint256 public constant EPOCH_DURATION = 7 days;
    uint256 public lastEpochTimestamp;
    uint256 public lastMarketCap;

    enum Winner {
        None,
        Bottom,
        Top
    }
    Winner public lastEpochWinner;

    Checkpoints.Trace224 private _bottomTokenCheckpoints;
    Checkpoints.Trace224 private _topTokenCheckpoints;
    Checkpoints.Trace224 private _marketCapCheckpoints;

    mapping(uint256 => mapping(address => bool)) private _hasClaimedReward;
    mapping(uint256 => uint256) private _epochRewards;

    event EpochSettled(
        uint256 indexed epochId,
        uint256 marketCap,
        Winner winner
    );
    event RewardsDistributed(
        uint256 indexed epochId,
        uint256 amount,
        Winner winnerSide
    );
    event RewardsClaimed(
        uint256 indexed epochId,
        address indexed user,
        uint256 amount
    );
    event LiquidityAdded(uint256 amountA, uint256 amountB, uint256 liquidity);

    constructor(
        address _bottomToken,
        address _topToken,
        address _thrusterRouter
    ) Ownable(msg.sender) ReentrancyGuard() {
        require(
            _bottomToken != address(0) &&
                _topToken != address(0) &&
                _thrusterRouter != address(0),
            "Invalid addresses"
        );
        bottomToken = IERC20(_bottomToken);
        topToken = IERC20(_topToken);
        thrusterRouter = _thrusterRouter;
        lastEpochTimestamp = block.timestamp;
    }

    function settleEpoch(uint256 currentMarketCap) external onlyOwner {
        require(
            block.timestamp >= lastEpochTimestamp + EPOCH_DURATION,
            "Epoch not finished"
        );

        Winner winner;
        if (currentMarketCap > lastMarketCap) {
            winner = Winner.Top;
        } else if (currentMarketCap < lastMarketCap) {
            winner = Winner.Bottom;
        } else {
            winner = Winner.None;
        }

        _marketCapCheckpoints.push(
            uint32(block.timestamp),
            uint224(currentMarketCap)
        );
        uint32 epochId = uint32(_marketCapCheckpoints.length());
        _bottomTokenCheckpoints.push(
            uint32(block.timestamp),
            uint224(bottomToken.totalSupply())
        );
        _topTokenCheckpoints.push(
            uint32(block.timestamp),
            uint224(topToken.totalSupply())
        );

        lastEpochWinner = winner;
        lastMarketCap = currentMarketCap;
        lastEpochTimestamp = block.timestamp;

        emit EpochSettled(epochId, currentMarketCap, winner);
    }

    function distributeRewards(uint256 epochId) external onlyOwner {
        require(
            epochId > 0 && epochId <= _marketCapCheckpoints.length(),
            "Invalid epoch ID"
        );
        Winner winner = getWinnerForEpoch(epochId);
        require(winner != Winner.None, "No winner for this epoch");

        uint256 rewardAmount = address(this).balance;
        require(rewardAmount > 0, "No rewards to distribute");

        _epochRewards[epochId] = rewardAmount;

        emit RewardsDistributed(epochId, rewardAmount, winner);
    }

    function claimRewards(uint256 epochId) external nonReentrant {
        require(
            epochId > 0 && epochId <= _marketCapCheckpoints.length(),
            "Invalid epoch ID"
        );
        require(
            !_hasClaimedReward[epochId][msg.sender],
            "Rewards already claimed"
        );

        Winner winner = getWinnerForEpoch(epochId);
        require(winner != Winner.None, "No winner for this epoch");

        IERC20 winningToken = winner == Winner.Bottom ? bottomToken : topToken;
        Checkpoints.Trace224 storage winningCheckpoints = winner ==
            Winner.Bottom
            ? _bottomTokenCheckpoints
            : _topTokenCheckpoints;

        uint256 userBalance = winningToken.balanceOf(msg.sender);
        uint256 totalSupply = uint256(
            winningCheckpoints.upperLookup(uint32(epochId))
        );

        uint256 rewardAmount = (_epochRewards[epochId] * userBalance) /
            totalSupply;
        require(rewardAmount > 0, "No rewards to claim");

        _hasClaimedReward[epochId][msg.sender] = true;
        _epochRewards[epochId] -= rewardAmount;

        (bool success, ) = msg.sender.call{value: rewardAmount}("");
        require(success, "Reward transfer failed");

        emit RewardsClaimed(epochId, msg.sender, rewardAmount);
    }

    function getWinnerForEpoch(uint256 epochId) public view returns (Winner) {
        require(
            epochId > 0 && epochId <= _marketCapCheckpoints.length(),
            "Invalid epoch ID"
        );
        if (epochId == 1) return Winner.None;

        uint256 currentMarketCap = _marketCapCheckpoints.upperLookup(
            uint32(epochId)
        );
        uint256 previousMarketCap = _marketCapCheckpoints.upperLookup(
            uint32(epochId - 1)
        );

        if (currentMarketCap > previousMarketCap) {
            return Winner.Top;
        } else if (currentMarketCap < previousMarketCap) {
            return Winner.Bottom;
        } else {
            return Winner.None;
        }
    }

    function getCurrentEpoch() public view returns (uint256) {
        return _marketCapCheckpoints.length();
    }

    function getTokenSupplyAtEpoch(
        uint256 epochId,
        bool isBottom
    ) public view returns (uint256) {
        require(
            epochId > 0 && epochId <= _marketCapCheckpoints.length(),
            "Invalid epoch ID"
        );
        return
            isBottom
                ? uint256(_bottomTokenCheckpoints.upperLookup(uint32(epochId)))
                : uint256(_topTokenCheckpoints.upperLookup(uint32(epochId)));
    }

    function addLiquidityToThruster(
        uint256 amountA,
        uint256 amountB
    ) external onlyOwner {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        IERC20(address(bottomToken)).forceApprove(thrusterRouter, amountA);
        IERC20(address(topToken)).forceApprove(thrusterRouter, amountB);

        IThrusterRouter(thrusterRouter).addLiquidity(
            address(bottomToken),
            address(topToken),
            amountA,
            amountB,
            (amountA * 95) / 100, // 5% slippage tolerance
            (amountB * 95) / 100, // 5% slippage tolerance
            address(this),
            block.timestamp + 15 minutes
        );

        // Revoke approvals
        IERC20(address(bottomToken)).forceApprove(thrusterRouter, 0);
        IERC20(address(topToken)).forceApprove(thrusterRouter, 0);
    }

    function withdrawUnclaimedRewards(uint256 epochId) external onlyOwner {
        require(
            epochId > 0 && epochId < getCurrentEpoch(),
            "Invalid or current epoch"
        );
        require(
            block.timestamp > lastEpochTimestamp + EPOCH_DURATION,
            "Epoch not finished"
        );

        uint256 unclaimedRewards = _epochRewards[epochId];
        require(unclaimedRewards > 0, "No unclaimed rewards");

        _epochRewards[epochId] = 0;
        (bool success, ) = msg.sender.call{value: unclaimedRewards}("");
        require(success, "Reward transfer failed");
    }

    receive() external payable {
        // Allow the contract to receive ETH
    }
}
