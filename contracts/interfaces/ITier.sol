// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ITier {
    event EventCreated(
        uint256 indexed eventId,
        uint256 numOfTiers,
        uint256 startAt,
        uint256 endAt
    );

    struct Event {
        uint256 numOfTiers;
        uint256 startAt;
        uint256 endAt;
    }

    function updatePoolContract(address _poolAddress) external;

    function createEvent(
        uint256 _eventId,
        uint256 _numOfTiers,
        uint256 _startAt,
        uint256 _endAt
    ) external;

    function setRequirementsByTier(uint256 _eventId, uint256[] calldata _values)
        external;

    function getWhitelist(uint256 _eventIdx, address[] calldata _users)
        external
        view
        returns (uint256[] memory, uint256[] memory);
}
