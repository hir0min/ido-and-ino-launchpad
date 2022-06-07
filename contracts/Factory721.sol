//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/Create2Upgradeable.sol";
import "./utils/INO721.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/IGovernance.sol";

contract Factory721 is IFactory, OwnableUpgradeable {
    bytes32 public constant VERSION = keccak256("Factory721_v1");

    IGovernance public governance;

    mapping(uint256 => address) public campaigns;

    modifier onlyCampaignManager() {
        require(_msgSender() == governance.manager(), "Only Campaign Manager");
        _;
    }

    function init(address _governance) external initializer {
        __Ownable_init();
        governance = IGovernance(_governance);
    }

    function updateGovernance(address _newGovernance)
        external
        override
        onlyOwner
    {
        require(_newGovernance != address(0), "Set zero address");
        governance = IGovernance(_newGovernance);
    }

    function createCampaign(uint256 _campaignId, Setting memory _setting)
        external
        override
        onlyCampaignManager
        returns (address _nft)
    {
        require(
            campaigns[_campaignId] == address(0),
            "Campaign already existed"
        );

        require(
            governance.acceptedPayments(_setting.paymentToken) ||
                _setting.paymentToken == address(0),
            "Invalid payment token"
        );

        require(
            block.timestamp <= _setting.startAt &&
                _setting.startAt < _setting.endAt,
            "Invalid settings"
        );

        bytes32 salt = keccak256(
            abi.encodePacked(
                _campaignId,
                _setting.startAt,
                _setting.endAt,
                VERSION
            )
        );
        bytes memory bytecode = type(INO721).creationCode;
        bytecode = abi.encodePacked(
            bytecode,
            abi.encode(
                address(governance),
                _msgSender(),
                _campaignId,
                _setting.startAt,
                _setting.endAt,
                _setting.paymentToken,
                _setting.name,
                _setting.symbol,
                _setting.uri
            )
        );
        _nft = Create2Upgradeable.deploy(0, salt, bytecode);
        campaigns[_campaignId] = _nft;

        emit NewCampaign(_campaignId, _nft, _setting.startAt, _setting.endAt);
    }

    function setWave(
        uint256 _campaignId,
        uint256 _waveId,
        uint256 _limit,
        uint256 _startAt,
        uint256 _endAt
    ) external override onlyCampaignManager {
        require(campaigns[_campaignId] != address(0), "Campaign not exist");

        address _nft = campaigns[_campaignId];
        INO721(_nft).setWave(_waveId, _limit, _startAt, _endAt);

        emit NewWave(_campaignId, _nft, _waveId, _startAt, _endAt);
    }
}
