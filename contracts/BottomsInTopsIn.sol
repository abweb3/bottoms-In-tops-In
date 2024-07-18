// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

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

contract BottomsInTopsIn is AccessControl, ReentrancyGuard, Pausable {
    using Checkpoints for Checkpoints.Trace224;
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable bottomToken;
    IERC20 public immutable topToken;
    address public immutable thrusterRouter;
    AggregatorV3Interface public immutable bottomTokenPriceFeed;
    AggregatorV3Interface public immutable topTokenPriceFeed;

    uint256 public constant EPOCH_DURATION = 7 days;
    uint256 public lastEpochTimestamp;
    uint256 public lastMarketCap;
    uint256 public constant MAX_REWARD = 1000 ether;

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
    event EmergencyWithdraw(address indexed token, uint256 amount);

    error NotOperator();
    error NotAdmin();

    constructor(
        address _bottomToken,
        address _topToken,
        address _thrusterRouter,
        address _bottomTokenPriceFeed,
        address _topTokenPriceFeed
    ) {
        require(
            _bottomToken != address(0) &&
                _topToken != address(0) &&
                _thrusterRouter != address(0) &&
                _bottomTokenPriceFeed != address(0) &&
                _topTokenPriceFeed != address(0),
            "Invalid addresses"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        bottomToken = IERC20(_bottomToken);
        topToken = IERC20(_topToken);
        thrusterRouter = _thrusterRouter;
        bottomTokenPriceFeed = AggregatorV3Interface(_bottomTokenPriceFeed);
        topTokenPriceFeed = AggregatorV3Interface(_topTokenPriceFeed);

        lastEpochTimestamp = block.timestamp;
        lastMarketCap = getCurrentMarketCap();

        _marketCapCheckpoints.push(
            uint32(block.timestamp),
            uint224(lastMarketCap)
        );
        _bottomTokenCheckpoints.push(
            uint32(block.timestamp),
            uint224(bottomToken.totalSupply())
        );
        _topTokenCheckpoints.push(
            uint32(block.timestamp),
            uint224(topToken.totalSupply())
        );
    }

    function settleEpoch() external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(
            block.timestamp >= lastEpochTimestamp + EPOCH_DURATION,
            "Epoch not finished"
        );

        uint256 currentTotalMarketCap = getCurrentMarketCap();
        uint32 epochId = uint32(_marketCapCheckpoints.length());

        _marketCapCheckpoints.push(
            uint32(block.timestamp),
            uint224(currentTotalMarketCap)
        );

        Winner winner;
        if (epochId == 1) {
            winner = Winner.Top;
        } else {
            winner = getWinnerForEpoch(epochId);
        }

        lastEpochWinner = winner;
        lastMarketCap = currentTotalMarketCap;
        lastEpochTimestamp = block.timestamp;

        emit EpochSettled(epochId, currentTotalMarketCap, winner);
    }

    function distributeRewards(
        uint256 epochId
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(
            epochId > 0 && epochId <= _marketCapCheckpoints.length(),
            "Invalid epoch ID"
        );

        Winner winner = getWinnerForEpoch(epochId);
        require(winner != Winner.None, "No winner for this epoch");

        uint256 rewardAmount = address(this).balance;
        require(rewardAmount > 0, "No rewards to distribute");

        rewardAmount = rewardAmount > MAX_REWARD ? MAX_REWARD : rewardAmount;
        _epochRewards[epochId] = rewardAmount;

        emit RewardsDistributed(epochId, rewardAmount, winner);
    }

    function claimRewards(uint256 epochId) external nonReentrant whenNotPaused {
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
        uint256 userBalance = winningToken.balanceOf(msg.sender);
        uint256 totalSupply = winningToken.totalSupply();
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

        if (epochId == 1) return Winner.Top;

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
        return isBottom ? bottomToken.totalSupply() : topToken.totalSupply();
    }

    function getBottomTokenPrice() public view returns (uint256) {
        (, int256 price, , , ) = bottomTokenPriceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return uint256(price);
    }

    function getTopTokenPrice() public view returns (uint256) {
        (, int256 price, , , ) = topTokenPriceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return uint256(price);
    }

    function getCurrentMarketCap() public view returns (uint256) {
        uint256 bottomSupply = bottomToken.totalSupply();
        uint256 topSupply = topToken.totalSupply();
        uint256 bottomPrice = getBottomTokenPrice();
        uint256 topPrice = getTopTokenPrice();
        uint256 bottomMarketCap = (bottomSupply * bottomPrice) / 1e8;
        uint256 topMarketCap = (topSupply * topPrice) / 1e8;
        return bottomMarketCap + topMarketCap;
    }

    function addLiquidityToThruster(
        uint256 amountA,
        uint256 amountB
    ) external onlyRole(OPERATOR_ROLE) {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        IERC20(address(bottomToken)).forceApprove(thrusterRouter, amountA);
        IERC20(address(topToken)).forceApprove(thrusterRouter, amountB);

        (
            uint256 addedAmountA,
            uint256 addedAmountB,
            uint256 liquidity
        ) = IThrusterRouter(thrusterRouter).addLiquidity(
                address(bottomToken),
                address(topToken),
                amountA,
                amountB,
                (amountA * 95) / 100, // 5% slippage tolerance
                (amountB * 95) / 100, // 5% slippage tolerance
                address(this),
                block.timestamp + 15 minutes
            );

        emit LiquidityAdded(addedAmountA, addedAmountB, liquidity);

        // Revoke approvals
        IERC20(address(bottomToken)).forceApprove(thrusterRouter, 0);
        IERC20(address(topToken)).forceApprove(thrusterRouter, 0);
    }

    function withdrawUnclaimedRewards(
        uint256 epochId
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
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

    function emergencyWithdraw(
        address token
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, balance);
        emit EmergencyWithdraw(token, balance);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    receive() external payable {}
}
