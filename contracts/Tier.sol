//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPool.sol";
import "./interfaces/ITier.sol";

contract Tier is ITier, Ownable {
    IPool public pool;

    //  Set Event's info
    mapping(uint256 => Event) public events;

    //  Set Stacking value requirements per Tier of the Event
    mapping(uint256 => mapping(uint256 => uint256)) public settings;

    constructor(address _poolAddr) Ownable() {
        require(_poolAddr != address(0), "Set zero address");
        pool = IPool(_poolAddr);
    }

    /**
        @notice Update Pool contract address
        @dev Caller must be contract owner
        @param _poolAddr contract address
     */
    function updatePoolContract(address _poolAddr) external override onlyOwner {
        require(_poolAddr != address(0), "Invalid Setting");
        pool = IPool(_poolAddr);
    }

    /**
        @notice Create IDO event
        @dev Caller must be Owner
        @param _eventId         ID of the Event
        @param _numOfTiers      A number of Tier list in the Event
        @param _startAt         Starting time of the Event (unix timestamp)
        @param _endAt           Ending time of the Event (unix timestamp)
    */
    function createEvent(
        uint256 _eventId,
        uint256 _numOfTiers,
        uint256 _startAt,
        uint256 _endAt
    ) external override onlyOwner {
        require(_numOfTiers > 0, "_numOfTiers is 0");
        require(_startAt < _endAt, "Invalid ending event");
        require(_startAt >= block.timestamp, "Invalid starting event");
        require(events[_eventId].numOfTiers == 0, "Invalid event id");

        events[_eventId] = Event(_numOfTiers, _startAt, _endAt);

        emit EventCreated(_eventId, _numOfTiers, _startAt, _endAt);
    }

    /**
        @notice Set requirement of stacking value per Tier in the Event
        @dev Caller must be Owner
        @param _eventId     ID of the Event
        @param _values      A list of setting values
     */
    function setRequirementsByTier(uint256 _eventId, uint256[] calldata _values)
        external
        override
        onlyOwner
    {
        uint256 _startAt = events[_eventId].startAt;
        uint256 _endAt = events[_eventId].endAt;
        require(
            _startAt == 0 || _endAt > block.timestamp,
            "Event already ended"
        );
        uint256 _numOfTiers = events[_eventId].numOfTiers;
        require(_values.length == _numOfTiers, "Invalid setting");

        for (uint256 i; i < _numOfTiers; i++) {
            settings[_eventId][i + 1] = _values[i];
        }
    }

    /**
        @notice Get WhiteList Users
        @dev Caller can be ANY
        @param _eventId     ID of the Event
        @param _users       A list of Users that needs to be queried
    */
    function getWhitelist(uint256 _eventId, address[] calldata _users)
        external
        view
        override
        returns (uint256[] memory _tiers, uint256[] memory _amounts)
    {
        uint256 _size = _users.length;
        require(_size != 0, "Empty list");

        _tiers = new uint256[](_size);
        _amounts = new uint256[](_size);

        _amounts = pool.getLockedAmounts(_users);
        for (uint256 i; i < _size; i++) {
            _tiers[i] = getTier(_eventId, _amounts[i]);
        }
    }

    function getTier(uint256 _eventId, uint256 _amount)
        private
        view
        returns (uint256 _tier)
    {
        uint256 _lo = settings[_eventId][1];
        if (_amount < _lo) return 0;

        uint256 _hi = events[_eventId].numOfTiers / 2;
        uint256 _value = settings[_eventId][_hi];

        if (_amount > _value) {
            _lo = _hi;
            _hi = events[_eventId].numOfTiers;
        } else {
            _lo = 1;
        }

        for (_hi; _hi >= _lo; _hi--) {
            _value = settings[_eventId][_hi];
            if (_amount >= _value) return _hi;
        }
    }
}
