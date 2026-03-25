// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

contract WhaleHandler is SomniaEventHandler {
    // ERC-20 Transfer(address,address,uint256) topic
    bytes32 public constant TRANSFER_TOPIC =
        keccak256("Transfer(address,address,uint256)");

    // Minimum transfer amount to qualify as a "whale" transfer (configurable)
    uint256 public whaleThreshold;

    // Owner for admin functions
    address public owner;

    struct WhaleTransfer {
        address token;
        address from;
        address to;
        uint256 amount;
        uint64 blockNumber;
        uint256 timestamp;
    }

    // Store recent whale transfers (ring buffer of last 100)
    WhaleTransfer[100] public whaleTransfers;
    uint256 public transferCount;

    event WhaleAlert(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint64 blockNumber
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 _whaleThreshold) {
        owner = msg.sender;
        whaleThreshold = _whaleThreshold;
    }

    function setWhaleThreshold(uint256 _newThreshold) external onlyOwner {
        whaleThreshold = _newThreshold;
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // Only process ERC-20 Transfer events
        if (eventTopics.length < 3) return;
        if (eventTopics[0] != TRANSFER_TOPIC) return;

        // Decode Transfer(from, to, amount)
        address from = address(uint160(uint256(eventTopics[1])));
        address to = address(uint160(uint256(eventTopics[2])));
        uint256 amount = abi.decode(data, (uint256));

        // Filter: only store if above whale threshold
        if (amount < whaleThreshold) return;

        // Store in ring buffer
        uint256 idx = transferCount % 100;
        whaleTransfers[idx] = WhaleTransfer({
            token: emitter,
            from: from,
            to: to,
            amount: amount,
            blockNumber: uint64(block.number),
            timestamp: block.timestamp
        });
        transferCount++;

        emit WhaleAlert(emitter, from, to, amount, uint64(block.number));
    }

    /// @notice Get the most recent whale transfers (up to `count`)
    function getRecentTransfers(uint256 count)
        external
        view
        returns (WhaleTransfer[] memory)
    {
        if (count > 100) count = 100;
        if (count > transferCount) count = transferCount;

        WhaleTransfer[] memory result = new WhaleTransfer[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = (transferCount - count + i) % 100;
            result[i] = whaleTransfers[idx];
        }
        return result;
    }
}
